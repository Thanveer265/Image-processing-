import json
import time
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

try:
    import torch
    import torch.nn as nn
    from torchvision import models
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

from app.utils.file_utils import resolve_storage_path


def _make_png_bytes(width: int = 64, height: int = 64, mode: str = "L", seed: int = 1) -> bytes:
    rng = np.random.default_rng(seed)
    if mode == "L":
        arr = np.zeros((height, width), dtype=np.uint8)
        yy, xx = np.ogrid[:height, :width]
        circle = ((xx - width // 2) ** 2 + (yy - height // 2) ** 2) <= (min(width, height) // 4) ** 2
        arr[circle] = 210
        noise = rng.integers(10, 45, size=(height, width), dtype=np.uint8)
        arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr, mode="L")
    else:
        arr = rng.integers(20, 220, size=(height, width, 3), dtype=np.uint8)
        img = Image.fromarray(arr, mode="RGB")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_health_endpoint(test_env):
    client = test_env["client"]
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database_connected"] is True
    assert body["medical_model_configured"] is False


def test_upload_validation_and_lifecycle(test_env):
    client = test_env["client"]

    # Reject bad extension
    bad_ext = client.post(
        "/api/images/upload",
        files={"file": ("malware.exe", b"MZ\x90\x00", "application/octet-stream")},
    )
    assert bad_ext.status_code == 400
    assert bad_ext.json()["error_code"] == "UNSUPPORTED_FORMAT"

    # Reject corrupt image claiming to be .png
    corrupt = client.post(
        "/api/images/upload",
        files={"file": ("broken.png", b"not-a-real-png-header", "image/png")},
    )
    assert corrupt.status_code == 400
    assert corrupt.json()["error_code"] == "CORRUPT_IMAGE"

    # Reject empty file
    empty = client.post(
        "/api/images/upload",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert empty.status_code == 400
    assert empty.json()["error_code"] == "EMPTY_FILE"

    # Valid upload
    png_bytes = _make_png_bytes(80, 64, mode="RGB", seed=7)
    up = client.post(
        "/api/images/upload",
        files={"file": ("../unsafe_dir/sample_test.png", png_bytes, "image/png")},
    )
    assert up.status_code == 200
    data = up.json()
    assert data["width"] == 80
    assert data["height"] == 64
    assert data["channels"] == 3
    assert "/" not in data["filename"]
    img_id = data["id"]

    # Retrieve binary file
    file_res = client.get(f"/api/images/{img_id}/file")
    assert file_res.status_code == 200
    assert file_res.content == png_bytes

    # List images
    list_res = client.get("/api/images")
    assert list_res.status_code == 200
    assert list_res.json()["total"] == 1

    # Delete image
    del_res = client.delete(f"/api/images/{img_id}")
    assert del_res.status_code == 200
    assert client.get(f"/api/images/{img_id}").status_code == 404


def test_preprocessing_creates_separate_processed_image(test_env):
    client = test_env["client"]
    png_bytes = _make_png_bytes(100, 80, mode="RGB", seed=2)
    up = client.post("/api/images/upload", files={"file": ("orig.png", png_bytes, "image/png")}).json()

    prep = client.post(
        f"/api/images/{up['id']}/preprocess",
        json={
            "grayscale": True,
            "resize_width": 64,
            "keep_aspect_ratio": True,
            "denoise_method": "gaussian",
            "denoise_strength": 3,
            "clahe_enabled": True,
            "normalization": "minmax",
        },
    )
    assert prep.status_code == 200
    pdata = prep.json()
    assert pdata["source_image_id"] == up["id"]
    assert pdata["processed_image_id"] != up["id"]
    assert pdata["output_width"] == 64
    assert pdata["output_channels"] == 1
    assert pdata["image"]["is_preprocessed"] is True

    # Source remains untouched
    orig_check = client.get(f"/api/images/{up['id']}").json()
    assert orig_check["width"] == 100
    assert orig_check["channels"] == 3


def test_feature_extraction_and_honest_shape_requirement(test_env):
    client = test_env["client"]
    png_bytes = _make_png_bytes(64, 64, mode="L", seed=3)
    up = client.post("/api/images/upload", files={"file": ("feat.png", png_bytes, "image/png")}).json()

    # Without shape threshold on grayscale image -> shape must NOT fabricate metrics
    res = client.post(
        "/api/features/extract",
        json={"image_id": up["id"], "extraction_method": "comprehensive", "apply_shape_threshold": False},
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["feature_vector"]) == 22
    assert body["statistical"]["mean"] > 0
    assert "contrast" in body["glcm"]
    assert len(body["lbp"]["histogram"]) == 10
    assert body["edges"]["edge_pixel_count"] >= 0
    assert len(body["frequency"]["wavelet_subbands_energy"]) == 4
    assert body["shape"]["region_detected"] is False
    assert "require" in body["shape"]["requirement_message"].lower()

    # Verify artifacts are downloadable
    assert client.get(body["visualizations"]["sobel"]).status_code == 200
    assert client.get(body["visualizations"]["canny"]).status_code == 200
    assert client.get(body["visualizations"]["lbp"]).status_code == 200
    assert client.get(body["visualizations"]["glcm"]).status_code == 200

    # With Otsu thresholding -> real contour detected
    res_shape = client.post(
        "/api/features/extract",
        json={"image_id": up["id"], "extraction_method": "comprehensive", "apply_shape_threshold": True},
    )
    assert res_shape.status_code == 200
    sbody = res_shape.json()
    assert sbody["shape"]["region_detected"] is True
    assert sbody["shape"]["area"] > 0
    assert sbody["visualizations"]["shape_mask"] is not None
    assert client.get(sbody["visualizations"]["shape_mask"]).status_code == 200

    # CSV export
    csv_res = client.get(f"/api/features/{up['id']}/csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "stat_mean" in csv_res.text


def test_pca_requires_multi_sample_and_persists_transform(test_env):
    client = test_env["client"]

    # Unfitted transform rejected
    unfit = client.post("/api/pca/transform", json={"feature_vector": [0.0] * 22})
    assert unfit.status_code == 400
    assert unfit.json()["error_code"] == "PCA_NOT_FITTED"

    # Upload 3 distinct images
    ids = []
    for seed in [11, 22, 33]:
        img_res = client.post(
            "/api/images/upload",
            files={"file": (f"pca_{seed}.png", _make_png_bytes(64, 64, mode="L", seed=seed), "image/png")},
        ).json()
        ids.append(img_res["id"])

    # Reject single-sample PCA fit
    single_fit = client.post("/api/pca/fit", json={"image_ids": [ids[0]], "n_components": 1})
    assert single_fit.status_code == 400
    assert single_fit.json()["error_code"] == "INSUFFICIENT_SAMPLES"

    # Fit on 3 images
    fit_res = client.post(
        "/api/pca/fit",
        json={"image_ids": ids, "n_components": 2, "model_name": "Test 3-Sample PCA"},
    )
    assert fit_res.status_code == 200
    fit_data = fit_res.json()
    assert fit_data["n_samples"] == 3
    assert fit_data["n_features"] == 22
    assert fit_data["n_components"] == 2
    assert len(fit_data["explained_variance_ratio"]) == 2

    # Check status
    status = client.get("/api/pca/status").json()
    assert status["fitted"] is True
    assert status["model_id"] == fit_data["model_id"]

    # Transform a 4th unseen image
    new_img = client.post(
        "/api/images/upload",
        files={"file": ("pca_test.png", _make_png_bytes(64, 64, mode="L", seed=44), "image/png")},
    ).json()
    tr_res = client.post("/api/pca/transform", json={"image_id": new_img["id"]})
    assert tr_res.status_code == 200
    tr_data = tr_res.json()
    assert tr_data["input_dimensions"] == 22
    assert tr_data["reduced_dimensions"] == 2
    assert len(tr_data["reduced_vector"]) == 2


def test_svd_cache_and_exact_zero_mse_psnr(test_env):
    client = test_env["client"]
    phantom = client.post("/api/images/sample/shepp_logan").json()
    img_id = phantom["id"]

    dec = client.post("/api/svd/decompose", json={"image_id": img_id})
    assert dec.status_code == 200
    d_body = dec.json()
    assert d_body["decomposed"] is True
    max_rank = d_body["max_rank"]

    # Low-rank reconstruction
    rec_low = client.post("/api/svd/reconstruct", json={"image_id": img_id, "rank": 5})
    assert rec_low.status_code == 200
    low_data = rec_low.json()
    assert low_data["rank"] == 5
    assert low_data["mse"] > 0
    assert low_data["psnr"] is not None
    assert client.get(low_data["reconstructed_url"]).status_code == 200
    assert client.get(low_data["difference_url"]).status_code == 200

    # Full-rank exact reconstruction -> MSE == 0 -> psnr is None & exact_reconstruction True
    rec_full = client.post("/api/svd/reconstruct", json={"image_id": img_id, "rank": max_rank})
    assert rec_full.status_code == 200
    full_data = rec_full.json()
    assert full_data["exact_reconstruction"] is True
    assert full_data["psnr"] is None
    assert full_data["retained_energy"] >= 99.9

    # Out-of-bounds rank returns 400
    bad_rank = client.post("/api/svd/reconstruct", json={"image_id": img_id, "rank": max_rank + 10})
    assert bad_rank.status_code == 400
    assert bad_rank.json()["error_code"] == "INVALID_RANK"


def test_medical_unconfigured_and_configured_resnet50_inference(test_env):
    client = test_env["client"]
    models_dir: Path = test_env["models_dir"]
    up = client.post(
        "/api/images/upload",
        files={"file": ("mri.png", _make_png_bytes(64, 64, mode="RGB", seed=9), "image/png")},
    ).json()

    # Unconfigured -> honest 503 MODEL_NOT_CONFIGURED
    st = client.get("/api/medical/status").json()
    assert st["classification_configured"] is False
    assert st["classification_error_code"] == "MODEL_NOT_CONFIGURED"

    cls_503 = client.post("/api/medical/classify", json={"image_id": up["id"]})
    assert cls_503.status_code == 503
    assert cls_503.json()["error_code"] == "MODEL_NOT_CONFIGURED"

    seg_503 = client.post("/api/medical/segment", json={"image_id": up["id"]})
    assert seg_503.status_code == 503
    assert seg_503.json()["error_code"] == "SEGMENTATION_MODEL_NOT_CONFIGURED"

    # Place real Colab-format JSON metadata (without .pth checkpoint yet) -> still MODEL_NOT_CONFIGURED
    cls_dir = models_dir / "classification"
    cls_dir.mkdir(parents=True, exist_ok=True)
    labels = ["glioma", "meningioma", "notumor", "pituitary"]
    (cls_dir / "class_labels.json").write_text(
        json.dumps({"0": "glioma", "1": "meningioma", "2": "notumor", "3": "pituitary"}),
        encoding="utf-8",
    )
    (cls_dir / "preprocessing_config.json").write_text(
        json.dumps({
            "image_size": [224, 224],
            "color_mode": "RGB",
            "normalization": {
                "mean": [0.485, 0.456, 0.406],
                "std": [0.229, 0.224, 0.225],
            },
            "architecture": "ResNet50",
            "num_classes": 4,
        }),
        encoding="utf-8",
    )
    (cls_dir / "training_metrics.json").write_text(
        json.dumps({"test_accuracy": 0.955}),
        encoding="utf-8",
    )

    st_meta = client.get("/api/medical/status").json()
    assert st_meta["classification_configured"] is False
    assert st_meta["supported_classes"] == labels
    assert st_meta["classification_files_status"]["class_labels.json"]["valid"] is True
    assert st_meta["classification_files_status"]["preprocessing_config.json"]["valid"] is True
    assert st_meta["classification_files_status"]["training_metrics.json"]["valid"] is True
    assert st_meta["classification_files_status"]["resnet50_brain_tumor.pth"]["present"] is False
    assert st_meta["training_metrics"]["test_accuracy"] == 0.955

    # Empty 0-byte checkpoint must be rejected as unconfigured
    (cls_dir / "resnet50_brain_tumor.pth").write_bytes(b"")
    st_empty = client.get("/api/medical/status").json()
    assert st_empty["classification_configured"] is False
    assert st_empty["classification_files_status"]["resnet50_brain_tumor.pth"]["valid"] is False
    cls_empty = client.post("/api/medical/classify", json={"image_id": up["id"]})
    assert cls_empty.status_code == 503
    assert cls_empty.json()["error_code"] == "MODEL_NOT_CONFIGURED"

    # Non-empty checkpoint verifies real inference path (or honest PYTORCH_NOT_INSTALLED)
    if HAS_TORCH:
        net = models.resnet50(weights=None)
        net.fc = nn.Linear(net.fc.in_features, len(labels))
        torch.save(net.state_dict(), cls_dir / "resnet50_brain_tumor.pth")

        st2 = client.get("/api/medical/status").json()
        assert st2["classification_configured"] is True

        cls_ok = client.post("/api/medical/classify", json={"image_id": up["id"]})
        assert cls_ok.status_code == 200
        pred = cls_ok.json()
        assert pred["predicted_class"] in labels
        assert abs(sum(p["probability"] for p in pred["probabilities"]) - 1.0) < 1e-4
    else:
        (cls_dir / "resnet50_brain_tumor.pth").write_bytes(b"placeholder")
        cls_no_torch = client.post("/api/medical/classify", json={"image_id": up["id"]})
        assert cls_no_torch.status_code == 503
        assert cls_no_torch.json()["error_code"] == "PYTORCH_NOT_INSTALLED"


def test_comparison_experiments_persistence_jobs_and_reports(test_env):
    client = test_env["client"]
    db_file: Path = test_env["db_file"]
    phantom = client.post("/api/images/sample/radial_target").json()

    # Comparison run
    cmp_res = client.post(
        "/api/comparison/run",
        json={"image_id": phantom["id"], "svd_rank": 10, "dct_retention_percent": 20},
    )
    assert cmp_res.status_code == 200
    cmp_body = cmp_res.json()
    assert len(cmp_body["items"]) >= 6
    assert cmp_body["medical_evaluation_available"] is False

    # Background job submission and polling
    job_res = client.post(
        "/api/jobs/comparison",
        json={"image_id": phantom["id"], "svd_rank": 8, "dct_retention_percent": 25},
    )
    assert job_res.status_code == 200
    job_id = job_res.json()["id"]
    assert job_res.json()["progress_measurable"] is False

    final_job = None
    for _ in range(40):
        poll = client.get(f"/api/jobs/{job_id}").json()
        if poll["status"] in ("COMPLETED", "FAILED"):
            final_job = poll
            break
        time.sleep(0.05)
    assert final_job is not None
    assert final_job["status"] == "COMPLETED"
    assert len(final_job["result"]["items"]) >= 6

    # Create experiment in SQLite
    exp_res = client.post(
        "/api/experiments",
        json={
            "name": "Radial Target SVD Benchmark",
            "input_image_ids": [phantom["id"]],
            "dataset_name": phantom["filename"],
            "selected_methods": ["SVD", "DCT"],
            "primary_method": "SVD",
            "svd_rank": 10,
            "metrics": {"psnr": 28.4, "retained_energy": 94.2},
            "notes": "Persisted integration test record",
        },
    )
    assert exp_res.status_code == 200
    exp_id = exp_res.json()["id"]

    # Verify persistence using an independent SQLAlchemy engine/session
    fresh_engine = create_engine(f"sqlite:///{db_file.as_posix()}", future=True)
    FreshSession = sessionmaker(bind=fresh_engine, future=True)
    with FreshSession() as s:
        from app.database.models import ExperimentRecord
        row = s.query(ExperimentRecord).filter(ExperimentRecord.id == exp_id).first()
        assert row is not None
        assert row.name == "Radial Target SVD Benchmark"
    fresh_engine.dispose()

    # Generate PDF and CSV reports
    pdf_rep = client.post(
        "/api/reports/generate",
        json={"title": "Test PDF Report", "report_type": "svd", "format": "pdf", "experiment_ids": [exp_id]},
    )
    assert pdf_rep.status_code == 200
    pdf_dl = client.get(pdf_rep.json()["download_url"])
    assert pdf_dl.status_code == 200
    assert pdf_dl.content.startswith(b"%PDF")

    csv_rep = client.post(
        "/api/reports/generate",
        json={"title": "Test CSV Report", "report_type": "summary", "format": "csv", "experiment_ids": [exp_id]},
    )
    assert csv_rep.status_code == 200
    csv_dl = client.get(csv_rep.json()["download_url"])
    assert csv_dl.status_code == 200
    assert "Radial Target SVD Benchmark" in csv_dl.text

    # Delete experiment
    assert client.delete(f"/api/experiments/{exp_id}").status_code == 200
    assert client.get(f"/api/experiments/{exp_id}").status_code == 404


def test_path_traversal_rejected(test_env):
    from fastapi import HTTPException
    try:
        resolve_storage_path("../../etc/passwd")
        assert False, "Expected HTTPException for path traversal"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail["error_code"] == "INVALID_PATH"


def test_medical_corrupt_image_and_checksum_verification(test_env, monkeypatch):
    from app.config import settings
    from app.services.medical_engine import reset_medical_cache

    client = test_env["client"]
    models_dir: Path = test_env["models_dir"]

    # Direct upload endpoint rejects corrupt image cleanly with 400 CORRUPT_IMAGE
    bad_upload = client.post(
        "/api/medical/classify/upload",
        files={"file": ("corrupt_mri.png", b"not-a-valid-png", "image/png")},
    )
    assert bad_upload.status_code == 400
    assert bad_upload.json()["error_code"] == "CORRUPT_IMAGE"

    # Direct upload endpoint rejects unsupported extension
    bad_ext = client.post(
        "/api/medical/classify/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert bad_ext.status_code == 400
    assert bad_ext.json()["error_code"] == "UNSUPPORTED_FORMAT"

    # Upload valid image, then corrupt its file on disk to test stored-file corruption handling
    up = client.post(
        "/api/images/upload",
        files={"file": ("mri_corrupt_check.png", _make_png_bytes(64, 64, mode="RGB", seed=17), "image/png")},
    ).json()
    stored_files = list((test_env["storage_dir"] / "uploads").glob("*"))
    assert len(stored_files) >= 1
    stored_files[-1].write_bytes(b"corrupted-bytes-on-disk")

    corrupt_stored = client.post("/api/medical/classify", json={"image_id": up["id"]})
    assert corrupt_stored.status_code == 400
    assert corrupt_stored.json()["error_code"] == "CORRUPT_IMAGE"

    # Checksum mismatch must mark model as unconfigured and refuse inference
    cls_dir = models_dir / "classification"
    cls_dir.mkdir(parents=True, exist_ok=True)
    (cls_dir / "class_labels.json").write_text(
        json.dumps({"0": "glioma", "1": "meningioma", "2": "notumor", "3": "pituitary"}),
        encoding="utf-8",
    )
    (cls_dir / "preprocessing_config.json").write_text(
        json.dumps({
            "image_size": [224, 224],
            "color_mode": "RGB",
            "normalization": {"mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]},
            "architecture": "ResNet50",
            "num_classes": 4,
        }),
        encoding="utf-8",
    )
    (cls_dir / "resnet50_brain_tumor.pth").write_bytes(b"PK\x03\x04" + b"\x00" * 1024)
    monkeypatch.setattr(settings, "MODEL_EXPECTED_SHA256", "0" * 64)
    reset_medical_cache()

    st_bad_sha = client.get("/api/medical/status").json()
    assert st_bad_sha["classification_configured"] is False
    assert st_bad_sha["classification_error_code"] == "MODEL_NOT_CONFIGURED"


def test_gdrive_model_downloader_security_and_idempotency(tmp_path: Path, monkeypatch):
    import hashlib
    import pytest
    from app.services import model_downloader as md

    cls_dir = tmp_path / "classification"
    cls_dir.mkdir(parents=True, exist_ok=True)
    labels_bytes = json.dumps({"0": "glioma", "1": "meningioma", "2": "notumor", "3": "pituitary"}).encode()
    prep_bytes = json.dumps({"image_size": [224, 224], "architecture": "ResNet50", "num_classes": 4}).encode()
    (cls_dir / "class_labels.json").write_bytes(labels_bytes)
    (cls_dir / "preprocessing_config.json").write_bytes(prep_bytes)

    # 1. Invalid Drive file ID rejected cleanly, no .pth created
    with pytest.raises(md.ModelDownloadError) as exc_id:
        md.download_checkpoint_from_gdrive(
            file_id="../evil/path",
            access_token="token-abc",
            models_dir=cls_dir,
        )
    assert exc_id.value.error_code == "INVALID_DRIVE_FILE_ID"
    assert not (cls_dir / "resnet50_brain_tumor.pth").exists()

    # 2. Missing credentials rejected cleanly, no .pth created
    with pytest.raises(md.ModelDownloadError) as exc_cred:
        md.download_checkpoint_from_gdrive(
            file_id="1AbCdEfGhIjKlMnOpQrStUvWxYz",
            credentials_json="",
            credentials_path="",
            access_token="",
            models_dir=cls_dir,
        )
    assert exc_cred.value.error_code == "DRIVE_CREDENTIALS_MISSING"
    assert not (cls_dir / "resnet50_brain_tumor.pth").exists()

    # 3. Simulated HTML error page from Drive is rejected and .tmp is cleaned up
    def _fake_html_download(file_id, token, tmp_file, max_size):
        tmp_file.write_bytes(b"<!DOCTYPE html><html><body>Google Drive Sign In</body></html>" * 20)

    monkeypatch.setattr(md, "_download_via_oauth_token", _fake_html_download)
    with pytest.raises(md.ModelDownloadError) as exc_html:
        md.download_checkpoint_from_gdrive(
            file_id="1AbCdEfGhIjKlMnOpQrStUvWxYz",
            access_token="fake-token",
            min_size_bytes=16,
            max_size_bytes=10_000_000,
            models_dir=cls_dir,
        )
    assert exc_html.value.error_code == "INVALID_CHECKPOINT_CONTENT"
    assert not (cls_dir / "resnet50_brain_tumor.pth").exists()
    assert not (cls_dir / "resnet50_brain_tumor.pth.tmp").exists()

    # 4. Simulated valid PyTorch ZIP-header checkpoint with SHA-256 verification
    fake_ckpt = b"PK\x03\x04" + (b"resnet50-weight-payload" * 100)
    expected_sha = hashlib.sha256(fake_ckpt).hexdigest()
    call_count = {"n": 0}

    def _fake_valid_download(file_id, token, tmp_file, max_size):
        call_count["n"] += 1
        tmp_file.write_bytes(fake_ckpt)

    monkeypatch.setattr(md, "_download_via_oauth_token", _fake_valid_download)

    # Wrong checksum rejected & cleaned up
    with pytest.raises(md.ModelDownloadError) as exc_sha:
        md.download_checkpoint_from_gdrive(
            file_id="1AbCdEfGhIjKlMnOpQrStUvWxYz",
            access_token="fake-token",
            expected_sha256="f" * 64,
            min_size_bytes=100,
            max_size_bytes=10_000_000,
            models_dir=cls_dir,
        )
    assert exc_sha.value.error_code == "CHECKSUM_MISMATCH"
    assert not (cls_dir / "resnet50_brain_tumor.pth").exists()

    # Matching checksum succeeds once
    res1 = md.download_checkpoint_from_gdrive(
        file_id="1AbCdEfGhIjKlMnOpQrStUvWxYz",
        access_token="fake-token",
        expected_sha256=expected_sha,
        min_size_bytes=100,
        max_size_bytes=10_000_000,
        models_dir=cls_dir,
    )
    assert res1["status"] == "downloaded"
    assert res1["downloaded"] is True
    assert res1["checksum_verified"] is True
    assert res1["sha256"] == expected_sha
    assert call_count["n"] == 2  # 1 failed sha + 1 succeeded

    # Second invocation skips re-download (idempotent one-time download)
    res2 = md.download_checkpoint_from_gdrive(
        file_id="1AbCdEfGhIjKlMnOpQrStUvWxYz",
        access_token="fake-token",
        expected_sha256=expected_sha,
        min_size_bytes=100,
        max_size_bytes=10_000_000,
        models_dir=cls_dir,
    )
    assert res2["status"] == "already_present"
    assert res2["downloaded"] is False
    assert call_count["n"] == 2

    # Confirm JSON metadata files were never modified
    assert (cls_dir / "class_labels.json").read_bytes() == labels_bytes
    assert (cls_dir / "preprocessing_config.json").read_bytes() == prep_bytes

