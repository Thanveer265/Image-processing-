import hmac
import importlib.util
import json
import logging
import threading
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.schemas import MedicalStatusResponse
from app.services.image_service import get_image_record
from app.services.model_downloader import (
    ModelDownloadError,
    compute_sha256,
    download_checkpoint_from_gdrive,
    normalize_expected_sha256,
)
from app.utils.file_utils import resolve_storage_path, validate_and_decode_image

logger = logging.getLogger(__name__)

RESEARCH_DISCLAIMER = (
    "Research & Educational Use Only: Deep-learning inference results are not clinically validated "
    "and must not be used for medical diagnosis or patient treatment decisions."
)

DEFAULT_CLASSES = ["glioma", "meningioma", "notumor", "pituitary"]

_MODEL_LOCK = threading.Lock()

_CLASSIFICATION_MODEL_CACHE: Dict[str, Any] = {
    "loaded": False,
    "path": None,
    "mtime": None,
    "size": None,
    "model": None,
    "labels": None,
    "config": None,
}

_CHECKSUM_CACHE: Dict[str, Any] = {
    "path": None,
    "mtime": None,
    "size": None,
    "sha256": None,
}

_LAST_LOAD_ERROR: Optional[str] = None


def reset_medical_cache() -> None:
    """Clear in-memory model and checksum caches (useful in tests or after model swap)."""
    global _LAST_LOAD_ERROR
    with _MODEL_LOCK:
        _CLASSIFICATION_MODEL_CACHE.update({
            "loaded": False,
            "path": None,
            "mtime": None,
            "size": None,
            "model": None,
            "labels": None,
            "config": None,
        })
        _CHECKSUM_CACHE.update({
            "path": None,
            "mtime": None,
            "size": None,
            "sha256": None,
        })
        _LAST_LOAD_ERROR = None


def _safe_model_file(base_dir: Path, filename: str) -> Path:
    resolved_base = base_dir.resolve()
    candidate = (resolved_base / filename).resolve()
    if resolved_base != candidate.parent:
        raise ValueError(f"Unsafe model path requested: {filename}")
    return candidate


def _classification_paths() -> Tuple[Path, Path, Path, Path]:
    base = settings.classification_models_path
    return (
        _safe_model_file(base, "resnet50_brain_tumor.pth"),
        _safe_model_file(base, "class_labels.json"),
        _safe_model_file(base, "preprocessing_config.json"),
        _safe_model_file(base, "training_metrics.json"),
    )


def _segmentation_paths() -> Tuple[Path, Path]:
    base = settings.segmentation_models_path
    return (
        _safe_model_file(base, "unet_brain_tumor.pth"),
        _safe_model_file(base, "segmentation_config.json"),
    )


def _is_pytorch_installed() -> bool:
    return (
        importlib.util.find_spec("torch") is not None
        and importlib.util.find_spec("torchvision") is not None
    )


def _get_cached_checkpoint_sha256(weights_path: Path) -> Optional[str]:
    if not weights_path.is_file():
        return None
    stat = weights_path.stat()
    if stat.st_size <= 0:
        return None
    if (
        _CHECKSUM_CACHE["path"] == str(weights_path)
        and _CHECKSUM_CACHE["mtime"] == stat.st_mtime
        and _CHECKSUM_CACHE["size"] == stat.st_size
        and _CHECKSUM_CACHE["sha256"]
    ):
        return str(_CHECKSUM_CACHE["sha256"])

    digest = compute_sha256(weights_path)
    _CHECKSUM_CACHE.update({
        "path": str(weights_path),
        "mtime": stat.st_mtime,
        "size": stat.st_size,
        "sha256": digest,
    })
    return digest


def _verify_expected_checksum(weights_path: Path) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Returns (checksum_ok, sha256_hex, error_message).
    When MODEL_EXPECTED_SHA256 is set, enforces exact SHA-256 match.
    """
    digest = _get_cached_checkpoint_sha256(weights_path)
    if not digest:
        return False, None, None

    expected_raw = (settings.MODEL_EXPECTED_SHA256 or "").strip()
    if not expected_raw:
        return True, digest, None

    try:
        expected = normalize_expected_sha256(expected_raw)
    except ModelDownloadError as exc:
        return False, digest, exc.message

    if not hmac.compare_digest(digest.lower(), expected):
        return (
            False,
            digest,
            "Checkpoint SHA-256 checksum does not match MODEL_EXPECTED_SHA256.",
        )
    return True, digest, None


def _parse_class_labels(raw_labels: Any) -> List[str]:
    if isinstance(raw_labels, list) and raw_labels:
        return [str(x) for x in raw_labels]
    if isinstance(raw_labels, dict):
        if "classes" in raw_labels and isinstance(raw_labels["classes"], list) and raw_labels["classes"]:
            return [str(x) for x in raw_labels["classes"]]
        if raw_labels:
            try:
                sorted_items = sorted(raw_labels.items(), key=lambda kv: int(kv[0]))
                return [str(v) for _, v in sorted_items]
            except (ValueError, TypeError) as exc:
                raise ValueError("Dictionary class_labels.json must map integer indices to class names.") from exc
    raise ValueError("Invalid class_labels.json format.")


def _parse_preprocessing_config(raw_cfg: Any) -> Dict[str, Any]:
    if not isinstance(raw_cfg, dict):
        raise ValueError("preprocessing_config.json must be a JSON object.")

    image_size = raw_cfg.get("image_size")
    if isinstance(image_size, list) and len(image_size) == 2:
        height, width = int(image_size[0]), int(image_size[1])
    elif isinstance(image_size, (int, float)):
        height = width = int(image_size)
    else:
        scalar_size = int(raw_cfg.get("input_size", 224))
        height = width = scalar_size

    if height <= 0 or width <= 0 or height > 2048 or width > 2048:
        raise ValueError("preprocessing_config.json image_size must be between 1 and 2048.")

    norm = raw_cfg.get("normalization")
    if isinstance(norm, dict):
        mean = norm.get("mean", [0.485, 0.456, 0.406])
        std = norm.get("std", [0.229, 0.224, 0.225])
    else:
        mean = raw_cfg.get("mean", [0.485, 0.456, 0.406])
        std = raw_cfg.get("std", [0.229, 0.224, 0.225])

    if not (isinstance(mean, list) and len(mean) == 3 and isinstance(std, list) and len(std) == 3):
        raise ValueError("preprocessing_config.json normalization mean and std must be 3-element lists.")

    mean_floats = [float(x) for x in mean]
    std_floats = [float(x) for x in std]
    if any(s <= 0 for s in std_floats):
        raise ValueError("preprocessing_config.json normalization std values must be positive.")

    color_mode = str(raw_cfg.get("color_mode", "RGB")).upper()
    if color_mode not in ("RGB", "L"):
        color_mode = "RGB"

    architecture = str(raw_cfg.get("architecture", "ResNet50"))
    num_classes = raw_cfg.get("num_classes")
    if num_classes is not None:
        num_classes = int(num_classes)

    model_version = str(raw_cfg.get("model_version") or f"{architecture.lower()}-brain-mri")

    return {
        "image_size": [height, width],
        "input_size": height,
        "color_mode": color_mode,
        "mean": mean_floats,
        "std": std_floats,
        "architecture": architecture,
        "num_classes": num_classes,
        "model_version": model_version,
    }


def preload_classification_model() -> None:
    """
    Executed once during FastAPI application startup (lifespan).
    - Optionally downloads the checkpoint once from Google Drive if
      MODEL_AUTO_DOWNLOAD_ON_STARTUP=true and the file is absent.
    - Loads the ResNet50 checkpoint once into memory if present and PyTorch is available.
    - Never fabricates weights and never crashes backend startup if unavailable.
    """
    global _LAST_LOAD_ERROR
    weights_path, labels_path, prep_path, _ = _classification_paths()

    if settings.MODEL_AUTO_DOWNLOAD_ON_STARTUP and not (
        weights_path.is_file() and weights_path.stat().st_size > 0
    ):
        try:
            download_checkpoint_from_gdrive()
        except ModelDownloadError as exc:
            _LAST_LOAD_ERROR = f"{exc.error_code}: {exc.message}"
            logger.warning("Startup model download skipped/failed (%s): %s", exc.error_code, exc.message)
        except Exception as exc:
            _LAST_LOAD_ERROR = f"DOWNLOAD_FAILED: {exc}"
            logger.warning("Unexpected startup model download error: %s", exc)

    if not settings.MODEL_PRELOAD_ON_STARTUP:
        return

    if not (
        weights_path.is_file()
        and weights_path.stat().st_size > 0
        and labels_path.is_file()
        and prep_path.is_file()
    ):
        return

    if not _is_pytorch_installed():
        logger.info("ResNet50 checkpoint present, but PyTorch is not installed; skipping startup preload.")
        return

    try:
        _load_classification_model()
        _LAST_LOAD_ERROR = None
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        _LAST_LOAD_ERROR = f"{detail.get('error_code', 'MODEL_LOAD_ERROR')}: {detail.get('message', '')}"
        logger.error("Startup ResNet50 preload failed: %s", _LAST_LOAD_ERROR)
    except Exception as exc:
        _LAST_LOAD_ERROR = f"MODEL_LOAD_ERROR: {exc}"
        logger.error("Unexpected startup ResNet50 preload failure: %s", exc)


def get_medical_status() -> MedicalStatusResponse:
    weights_path, labels_path, prep_path, metrics_path = _classification_paths()
    seg_weights_path, seg_cfg_path = _segmentation_paths()

    weights_present = weights_path.is_file()
    weights_size = weights_path.stat().st_size if weights_present else 0
    checksum_ok = False
    sha256_hex: Optional[str] = None
    checksum_error: Optional[str] = None

    if weights_present and weights_size > 0:
        checksum_ok, sha256_hex, checksum_error = _verify_expected_checksum(weights_path)

    weights_valid = weights_present and weights_size > 0 and checksum_ok

    labels_present = labels_path.is_file()
    labels_size = labels_path.stat().st_size if labels_present else 0
    labels_valid = False
    labels = list(DEFAULT_CLASSES)

    if labels_present:
        try:
            loaded_labels = json.loads(labels_path.read_text(encoding="utf-8"))
            labels = _parse_class_labels(loaded_labels)
            labels_valid = True
        except Exception as exc:
            logger.warning("Invalid class_labels.json: %s", exc)
            labels_valid = False

    prep_present = prep_path.is_file()
    prep_size = prep_path.stat().st_size if prep_present else 0
    prep_valid = False
    parsed_prep: Optional[Dict[str, Any]] = None
    model_version: Optional[str] = None

    if prep_present:
        try:
            raw_prep = json.loads(prep_path.read_text(encoding="utf-8"))
            parsed_prep = _parse_preprocessing_config(raw_prep)
            model_version = parsed_prep["model_version"]
            prep_valid = True
            if parsed_prep["num_classes"] is not None and labels_valid and parsed_prep["num_classes"] != len(labels):
                logger.warning(
                    "num_classes (%s) does not match class_labels count (%d)",
                    parsed_prep["num_classes"],
                    len(labels),
                )
                prep_valid = False
        except Exception as exc:
            logger.warning("Invalid preprocessing_config.json: %s", exc)
            prep_valid = False

    metrics_present = metrics_path.is_file()
    metrics_size = metrics_path.stat().st_size if metrics_present else 0
    metrics_valid = False
    training_metrics: Optional[Dict[str, Any]] = None
    if metrics_present:
        try:
            loaded_metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            if isinstance(loaded_metrics, dict):
                training_metrics = loaded_metrics
                metrics_valid = True
        except Exception as exc:
            logger.warning("Invalid training_metrics.json: %s", exc)
            metrics_valid = False

    file_status: Dict[str, Dict[str, Any]] = {
        "resnet50_brain_tumor.pth": {
            "present": weights_present,
            "valid": weights_valid,
            "size_bytes": weights_size,
            "required": True,
        },
        "class_labels.json": {
            "present": labels_present,
            "valid": labels_valid,
            "size_bytes": labels_size,
            "required": True,
        },
        "preprocessing_config.json": {
            "present": prep_present,
            "valid": prep_valid,
            "size_bytes": prep_size,
            "required": True,
        },
        "training_metrics.json": {
            "present": metrics_present,
            "valid": metrics_valid,
            "size_bytes": metrics_size,
            "required": False,
        },
    }

    missing_files = [
        name for name, info in file_status.items()
        if info["required"] and not info["valid"]
    ]

    load_error = checksum_error or _LAST_LOAD_ERROR
    cls_ready = weights_valid and labels_valid and prep_valid and (_LAST_LOAD_ERROR is None)
    seg_ready = (
        seg_weights_path.is_file()
        and seg_weights_path.stat().st_size > 0
        and seg_cfg_path.is_file()
    )
    pytorch_installed = _is_pytorch_installed()
    model_loaded_in_memory = bool(
        _CLASSIFICATION_MODEL_CACHE["loaded"]
        and _CLASSIFICATION_MODEL_CACHE["path"] == str(weights_path)
    )

    if cls_ready:
        if pytorch_installed:
            msg = "ResNet50 classification checkpoint and metadata are verified and ready for inference."
        else:
            msg = (
                "ResNet50 checkpoint and metadata files are present, but PyTorch/torchvision "
                "are not installed in the backend environment. Install them with: pip install torch torchvision"
            )
    elif checksum_error:
        msg = f"{checksum_error} Re-download the verified checkpoint via backend/scripts/download_model.py."
    elif _LAST_LOAD_ERROR and weights_present and weights_size > 0:
        msg = f"ResNet50 checkpoint failed verification or loading ({_LAST_LOAD_ERROR})."
    elif labels_valid and prep_valid and not weights_valid:
        if weights_present and weights_size == 0:
            msg = (
                "Classification metadata files are installed, but resnet50_brain_tumor.pth is empty (0 bytes). "
                "Run backend/scripts/download_model.py or copy your verified checkpoint into backend/app/models/classification/."
            )
        else:
            msg = (
                "Classification metadata files are installed (class_labels.json, preprocessing_config.json), "
                "but the trained checkpoint resnet50_brain_tumor.pth is missing from backend/app/models/classification/."
            )
    else:
        msg = (
            "Brain MRI classification model is not configured. Download trained ResNet50 weights "
            "(resnet50_brain_tumor.pth) with class_labels.json and preprocessing_config.json into "
            "backend/app/models/classification/."
        )

    return MedicalStatusResponse(
        classification_configured=cls_ready,
        segmentation_configured=seg_ready,
        classification_error_code=None if cls_ready else "MODEL_NOT_CONFIGURED",
        segmentation_error_code=None if seg_ready else "SEGMENTATION_MODEL_NOT_CONFIGURED",
        message=msg,
        expected_classification_files=[
            "resnet50_brain_tumor.pth",
            "class_labels.json",
            "preprocessing_config.json",
            "training_metrics.json",
        ],
        expected_segmentation_files=[
            "unet_brain_tumor.pth",
            "segmentation_config.json",
        ],
        supported_classes=labels,
        model_version=model_version,
        disclaimer=RESEARCH_DISCLAIMER,
        pytorch_installed=pytorch_installed,
        model_loaded_in_memory=model_loaded_in_memory,
        checkpoint_sha256_prefix=sha256_hex[:16] if sha256_hex else None,
        load_error=load_error,
        missing_classification_files=missing_files,
        classification_files_status=file_status,
        preprocessing_config=parsed_prep,
        training_metrics=training_metrics,
    )


def _import_torch_stack():
    try:
        import torch
        import torch.nn as nn
        from torchvision import models, transforms
        return torch, nn, models, transforms
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "PYTORCH_NOT_INSTALLED",
                "message": (
                    "PyTorch/torchvision are required to run ResNet50 MRI inference. "
                    "Install optional medical dependencies with: pip install torch torchvision"
                ),
            },
        ) from exc


def _load_classification_model() -> Tuple[Any, List[str], Dict[str, Any]]:
    global _LAST_LOAD_ERROR
    weights_path, labels_path, prep_path, _ = _classification_paths()
    weights_present = weights_path.is_file() and weights_path.stat().st_size > 0
    if not (weights_present and labels_path.is_file() and prep_path.is_file()):
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "MODEL_NOT_CONFIGURED",
                "message": (
                    "Brain MRI classification model is not configured. Expected non-empty "
                    "resnet50_brain_tumor.pth, class_labels.json, and preprocessing_config.json "
                    "in backend/app/models/classification/."
                ),
            },
        )

    checksum_ok, _, checksum_err = _verify_expected_checksum(weights_path)
    if not checksum_ok:
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "MODEL_NOT_CONFIGURED",
                "message": checksum_err or "Checkpoint checksum verification failed.",
            },
        )

    torch, nn, models, _ = _import_torch_stack()

    with _MODEL_LOCK:
        stat = weights_path.stat()
        mtime = stat.st_mtime
        size = stat.st_size
        if (
            _CLASSIFICATION_MODEL_CACHE["loaded"]
            and _CLASSIFICATION_MODEL_CACHE["path"] == str(weights_path)
            and _CLASSIFICATION_MODEL_CACHE["mtime"] == mtime
            and _CLASSIFICATION_MODEL_CACHE["size"] == size
        ):
            return (
                _CLASSIFICATION_MODEL_CACHE["model"],
                _CLASSIFICATION_MODEL_CACHE["labels"],
                _CLASSIFICATION_MODEL_CACHE["config"],
            )

        try:
            raw_labels = json.loads(labels_path.read_text(encoding="utf-8"))
            labels = _parse_class_labels(raw_labels)
            raw_prep = json.loads(prep_path.read_text(encoding="utf-8"))
            prep_cfg = _parse_preprocessing_config(raw_prep)
        except Exception as exc:
            _LAST_LOAD_ERROR = f"INVALID_MODEL_METADATA: {exc}"
            raise HTTPException(
                status_code=500,
                detail={
                    "error_code": "INVALID_MODEL_METADATA",
                    "message": f"Invalid classification metadata JSON: {exc}",
                },
            ) from exc

        if prep_cfg["num_classes"] is not None and prep_cfg["num_classes"] != len(labels):
            msg = (
                f"preprocessing_config.json num_classes ({prep_cfg['num_classes']}) "
                f"does not match class_labels.json count ({len(labels)})."
            )
            _LAST_LOAD_ERROR = f"INVALID_MODEL_METADATA: {msg}"
            raise HTTPException(
                status_code=500,
                detail={"error_code": "INVALID_MODEL_METADATA", "message": msg},
            )

        if prep_cfg["architecture"].lower() != "resnet50":
            msg = f"Unsupported architecture '{prep_cfg['architecture']}'. Expected ResNet50."
            _LAST_LOAD_ERROR = f"UNSUPPORTED_ARCHITECTURE: {msg}"
            raise HTTPException(
                status_code=500,
                detail={"error_code": "UNSUPPORTED_ARCHITECTURE", "message": msg},
            )

        model = models.resnet50(weights=None)
        in_features = model.fc.in_features
        model.fc = nn.Linear(in_features, len(labels))

        try:
            try:
                checkpoint = torch.load(str(weights_path), map_location=torch.device("cpu"), weights_only=True)
            except TypeError:
                checkpoint = torch.load(str(weights_path), map_location=torch.device("cpu"))

            if isinstance(checkpoint, dict):
                if "model_state_dict" in checkpoint:
                    state_dict = checkpoint["model_state_dict"]
                elif "state_dict" in checkpoint:
                    state_dict = checkpoint["state_dict"]
                else:
                    state_dict = checkpoint
            else:
                state_dict = checkpoint

            if not isinstance(state_dict, dict):
                raise ValueError("Checkpoint does not contain a valid PyTorch state_dict.")

            if any(k.startswith("module.") for k in state_dict.keys()):
                state_dict = {
                    (k[7:] if k.startswith("module.") else k): v
                    for k, v in state_dict.items()
                }

            model.load_state_dict(state_dict, strict=True)
            model.eval()
        except Exception as exc:
            _LAST_LOAD_ERROR = f"INVALID_MODEL_CHECKPOINT: {exc}"
            raise HTTPException(
                status_code=503,
                detail={
                    "error_code": "MODEL_NOT_CONFIGURED",
                    "message": f"Failed to load ResNet50 checkpoint weights: {exc}",
                },
            ) from exc

        _LAST_LOAD_ERROR = None
        _CLASSIFICATION_MODEL_CACHE.update({
            "loaded": True,
            "path": str(weights_path),
            "mtime": mtime,
            "size": size,
            "model": model,
            "labels": labels,
            "config": prep_cfg,
        })
        logger.info(
            "Loaded ResNet50 medical classification model (%d classes, fc=%d->%d)",
            len(labels),
            in_features,
            len(labels),
        )
        return model, labels, prep_cfg


def run_inference_on_pil(pil_img: Image.Image, *, image_id: str) -> Dict[str, Any]:
    model, labels, cfg = _load_classification_model()
    torch, _, _, transforms = _import_torch_stack()

    start_time = time.perf_counter()
    height, width = cfg["image_size"]
    mean = cfg["mean"]
    std = cfg["std"]
    color_mode = cfg["color_mode"]

    transform = transforms.Compose([
        transforms.Resize((height, width)),
        transforms.ToTensor(),
        transforms.Normalize(mean=mean, std=std),
    ])

    try:
        converted = pil_img.convert(color_mode)
        if color_mode == "L":
            converted = converted.convert("RGB")
        tensor = transform(converted).unsqueeze(0)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "CORRUPT_IMAGE",
                "message": f"Failed to decode or preprocess image for inference: {exc}",
            },
        ) from exc

    with torch.inference_mode():
        logits = model(tensor)
        if logits.ndim != 2 or logits.shape[1] != len(labels):
            raise HTTPException(
                status_code=500,
                detail={
                    "error_code": "INVALID_MODEL_OUTPUT",
                    "message": f"Model output dimension {tuple(logits.shape)} does not match {len(labels)} classes.",
                },
            )
        probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

    if not np.all(np.isfinite(probs)):
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "INVALID_MODEL_OUTPUT",
                "message": "Model returned non-finite probability values.",
            },
        )

    best_idx = int(np.argmax(probs))
    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    prob_items = [
        {"label": labels[i], "probability": round(float(probs[i]), 6)}
        for i in range(len(labels))
    ]
    prob_items.sort(key=lambda x: x["probability"], reverse=True)

    return {
        "image_id": image_id,
        "predicted_class": labels[best_idx],
        "confidence": round(float(probs[best_idx]), 6),
        "probabilities": prob_items,
        "model_version": cfg["model_version"],
        "architecture": cfg["architecture"],
        "input_size": height,
        "processing_time_ms": elapsed_ms,
        "disclaimer": RESEARCH_DISCLAIMER,
        "model_status": "ready",
        "status": "success",
    }


def classify_mri(db: Session, image_id: str) -> Dict[str, Any]:
    record = get_image_record(db, image_id)
    img_path = resolve_storage_path(record.relative_path)
    if not img_path.exists():
        raise HTTPException(status_code=404, detail={
            "error_code": "IMAGE_FILE_MISSING",
            "message": f"Image file for '{image_id}' is missing on disk.",
        })

    # Validate image integrity before inference so corrupt images return 400 CORRUPT_IMAGE
    try:
        with Image.open(img_path) as check_img:
            check_img.verify()
    except (UnidentifiedImageError, OSError, Exception) as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "CORRUPT_IMAGE",
                "message": f"Stored image '{record.filename}' is corrupted or unreadable.",
            },
        ) from exc

    try:
        with Image.open(img_path) as pil_img:
            return run_inference_on_pil(pil_img, image_id=record.id)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "CORRUPT_IMAGE",
                "message": f"Image file could not be decoded for classification: {exc}",
            },
        ) from exc


def classify_uploaded_mri(content: bytes, filename: str) -> Dict[str, Any]:
    """
    Validate an uploaded MRI image file (extension, size, binary header, full decode)
    and run live ResNet50 classification without fabricating predictions.
    """
    validate_and_decode_image(content, filename)
    try:
        with Image.open(BytesIO(content)) as pil_img:
            return run_inference_on_pil(pil_img, image_id="direct-upload")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "CORRUPT_IMAGE",
                "message": f"Uploaded image file could not be decoded: {exc}",
            },
        ) from exc


def segment_mri(db: Session, image_id: str) -> Dict[str, Any]:
    get_image_record(db, image_id)
    seg_weights_path, seg_cfg_path = _segmentation_paths()
    if not (
        seg_weights_path.is_file()
        and seg_weights_path.stat().st_size > 0
        and seg_cfg_path.is_file()
    ):
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "SEGMENTATION_MODEL_NOT_CONFIGURED",
                "message": (
                    "Separate U-Net segmentation model weights are not configured. "
                    "Place unet_brain_tumor.pth and segmentation_config.json into backend/app/models/segmentation/."
                ),
            },
        )
    raise HTTPException(
        status_code=501,
        detail={
            "error_code": "SEGMENTATION_LOADER_UNSPECIFIED",
            "message": "Segmentation weights detected, but architecture loader requires TorchScript export.",
        },
    )
