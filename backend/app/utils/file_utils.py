import re
import uuid
from io import BytesIO
from pathlib import Path
from typing import Tuple

import cv2
import numpy as np
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from app.config import settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_PIL_FORMATS = {"JPEG", "PNG"}


def sanitize_filename(filename: str) -> str:
    """Strip directory paths and sanitize filename to prevent path traversal."""
    base = Path(filename or "upload.png").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return cleaned[:200] or "upload.png"


def generate_unique_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def resolve_storage_path(relative_path: str) -> Path:
    """Safely resolve a relative path within settings.storage_path."""
    storage_root = settings.storage_path.resolve()
    target = (storage_root / relative_path).resolve()
    try:
        target.relative_to(storage_root)
    except ValueError:
        raise HTTPException(status_code=400, detail={
            "error_code": "INVALID_PATH",
            "message": "Invalid storage path reference.",
        })
    return target


def validate_and_decode_image(content: bytes, filename: str) -> Tuple[np.ndarray, str, int, int, int, str]:
    """
    Validate file size, extension, and actual image binary content using Pillow and OpenCV.
    Never trusts browser MIME type or filename alone.
    Returns: (cv_image_bgr_or_gray, format_str, width, height, channels, color_mode)
    """
    if not content:
        raise HTTPException(status_code=400, detail={
            "error_code": "EMPTY_FILE",
            "message": "Uploaded file is empty.",
        })

    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(status_code=413, detail={
            "error_code": "FILE_TOO_LARGE",
            "message": f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
        })

    safe_name = sanitize_filename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail={
            "error_code": "UNSUPPORTED_FORMAT",
            "message": f"Unsupported file extension '{ext}'. Only JPG, JPEG, and PNG are allowed.",
        })

    # Verify binary image integrity with Pillow
    try:
        with Image.open(BytesIO(content)) as pil_img:
            pil_format = (pil_img.format or "").upper()
            pil_img.verify()
    except (UnidentifiedImageError, Exception):
        raise HTTPException(status_code=400, detail={
            "error_code": "CORRUPT_IMAGE",
            "message": "The uploaded file is corrupt or not a valid JPG/PNG image.",
        })

    if pil_format not in ALLOWED_PIL_FORMATS:
        raise HTTPException(status_code=400, detail={
            "error_code": "UNSUPPORTED_FORMAT",
            "message": f"Actual image content format '{pil_format}' is not supported. Use JPG or PNG.",
        })

    # Decode into OpenCV array
    arr = np.frombuffer(content, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None or img.size == 0:
        raise HTTPException(status_code=400, detail={
            "error_code": "DECODE_FAILED",
            "message": "Failed to decode pixel matrix from image.",
        })

    if img.ndim == 2:
        height, width = img.shape
        channels = 1
        color_mode = "grayscale"
    else:
        height, width, channels = img.shape
        if channels == 4:
            # Convert RGBA/BGRA to standard 3-channel BGR for consistent CV processing
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
            channels = 3
            color_mode = "rgb"
        elif channels == 3:
            color_mode = "rgb"
        else:
            color_mode = "grayscale"

    return img, pil_format, int(width), int(height), int(channels), color_mode
