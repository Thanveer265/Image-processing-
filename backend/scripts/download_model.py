#!/usr/bin/env python3
"""
Pre-deployment script to securely download and verify the trained ResNet50
brain MRI classification checkpoint from Google Drive into:

    backend/app/models/classification/resnet50_brain_tumor.pth

Run once during Python backend deployment preparation (never per request):

    cd backend
    python scripts/download_model.py

Required environment variables (in backend/.env or host environment):
    GOOGLE_DRIVE_FILE_ID           - Drive File ID of ImageLab/trained_model/resnet50_brain_tumor.pth
    GOOGLE_DRIVE_CREDENTIALS_PATH  - Path to Service Account JSON key (or GOOGLE_DRIVE_CREDENTIALS_JSON)
    MODEL_EXPECTED_SHA256          - (Recommended) Expected 64-char SHA-256 hex checksum
"""
import argparse
import json
import logging
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings
from app.services.model_downloader import (
    CHECKPOINT_FILENAME,
    ModelDownloadError,
    download_checkpoint_from_gdrive,
    verify_checkpoint_file,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("imagelab.download_model")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Securely download and verify ImageLab ResNet50 checkpoint from Google Drive."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download checkpoint even if a valid file already exists.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Do not download; only verify the existing checkpoint file size and SHA-256 checksum.",
    )
    args = parser.parse_args()

    target = settings.classification_models_path / CHECKPOINT_FILENAME

    try:
        if args.verify_only:
            result = verify_checkpoint_file(
                target,
                expected_sha256=settings.MODEL_EXPECTED_SHA256,
                min_size_bytes=settings.MODEL_MIN_SIZE_BYTES,
                max_size_bytes=settings.MODEL_MAX_SIZE_BYTES,
            )
            print(json.dumps({"status": "verified", **result}, indent=2))
            return 0

        result = download_checkpoint_from_gdrive(force=args.force)
        print(json.dumps(result, indent=2))
        if not result.get("checksum_verified"):
            logger.warning(
                "MODEL_EXPECTED_SHA256 is not set. Pin this verified digest in your backend .env: "
                "MODEL_EXPECTED_SHA256=%s",
                result["sha256"],
            )
        return 0
    except ModelDownloadError as exc:
        logger.error("[%s] %s", exc.error_code, exc.message)
        return 1
    except Exception as exc:
        logger.exception("Unexpected error during checkpoint download: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
