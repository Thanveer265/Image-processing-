#!/usr/bin/env python3
"""
Verification CLI for ImageLab's ResNet50 Brain MRI classification deployment.

Checks:
  1. Presence and validity of all 4 files in backend/app/models/classification/
  2. Non-zero checkpoint size + SHA-256 checksum (and MODEL_EXPECTED_SHA256 if set)
  3. Exact ResNet50 architecture (fc: 2048 -> 4 classes) and weight compatibility
  4. Optional real MRI image inference confirming 4 finite probabilities summing to ~1.0

Usage:
    cd backend
    python scripts/verify_model.py
    python scripts/verify_model.py --image /path/to/brain_mri.jpg
"""
import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from PIL import Image
from app.config import settings
from app.services.medical_engine import _load_classification_model, get_medical_status, run_inference_on_pil
from app.services.model_downloader import CHECKPOINT_FILENAME, compute_sha256


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify ImageLab ResNet50 checkpoint and inference pipeline.")
    parser.add_argument("--image", type=str, default="", help="Optional path to an MRI image for live test inference.")
    args = parser.parse_args()

    status = get_medical_status()
    print("=== Classification Directory Status ===")
    for fname, info in status.classification_files_status.items():
        flag = "OK" if info["valid"] else ("MISSING" if not info["present"] else "INVALID")
        print(f"  [{flag:7s}] {fname:28s} ({info['size_bytes']:,} bytes)")

    print(f"Supported classes : {status.supported_classes}")
    print(f"PyTorch installed : {status.pytorch_installed}")
    print(f"Configured        : {status.classification_configured}")

    weights_path = settings.classification_models_path / CHECKPOINT_FILENAME
    if weights_path.is_file() and weights_path.stat().st_size > 0:
        print(f"Checkpoint SHA-256: {compute_sha256(weights_path)}")

    if not status.classification_configured:
        print(f"\nERROR: {status.classification_error_code} — {status.message}")
        return 1

    if not status.pytorch_installed:
        print("\nERROR: PYTORCH_NOT_INSTALLED — install torch and torchvision in your Python environment.")
        return 1

    print("\n=== Loading ResNet50 Architecture & Checkpoint ===")
    model, labels, cfg = _load_classification_model()
    print(f"Architecture      : {cfg['architecture']}")
    print(f"Output layer      : Linear({model.fc.in_features} -> {model.fc.out_features})")
    print(f"Input size        : {cfg['image_size']} ({cfg['color_mode']})")
    print(f"Normalization     : mean={cfg['mean']}, std={cfg['std']}")
    assert model.fc.out_features == len(labels) == 4, (
        f"Expected 4-class output layer, got {model.fc.out_features}"
    )

    if args.image:
        img_path = Path(args.image).expanduser().resolve()
        if not img_path.is_file():
            print(f"\nERROR: Test image not found: {img_path}")
            return 1
        print(f"\n=== Running Test Inference on {img_path.name} ===")
        with Image.open(img_path) as pil_img:
            result = run_inference_on_pil(pil_img, image_id="cli-verification")
        prob_sum = sum(p["probability"] for p in result["probabilities"])
        print(json.dumps(result, indent=2))
        print(f"Probability sum   : {prob_sum:.6f}")
        assert len(result["probabilities"]) == 4, "Expected 4 class probabilities"
        assert abs(prob_sum - 1.0) < 1e-3, f"Probabilities did not sum to 1.0 (got {prob_sum})"
        print("Inference verification PASSED.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
