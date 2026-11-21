import logging
from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database.models import ImageRecord
from app.schemas.schemas import ImageResponse
from app.utils.file_utils import (
    generate_unique_id,
    resolve_storage_path,
    sanitize_filename,
    validate_and_decode_image,
)

logger = logging.getLogger(__name__)


def to_image_response(record: ImageRecord) -> ImageResponse:
    return ImageResponse(
        id=record.id,
        filename=record.filename,
        format=record.format,
        width=record.width,
        height=record.height,
        channels=record.channels,
        color_mode=record.color_mode,
        file_size=record.file_size,
        mean_intensity=round(float(record.mean_intensity), 2),
        std_dev_intensity=round(float(record.std_dev_intensity), 2),
        is_preprocessed=record.is_preprocessed,
        parent_image_id=record.parent_image_id,
        file_url=f"/api/images/{record.id}/file",
        created_at=record.created_at,
    )


def compute_intensity_stats(img: np.ndarray) -> tuple[float, float]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    return float(np.mean(gray)), float(np.std(gray))


def save_uploaded_image(db: Session, content: bytes, original_filename: str) -> ImageRecord:
    img, fmt, width, height, channels, color_mode = validate_and_decode_image(content, original_filename)
    safe_name = sanitize_filename(original_filename)
    image_id = generate_unique_id("img")
    ext = ".png" if fmt == "PNG" else ".jpg"
    stored_filename = f"{image_id}{ext}"
    relative_path = f"uploads/{stored_filename}"
    dest_path = resolve_storage_path(relative_path)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    # Save exact original bytes without overwriting
    dest_path.write_bytes(content)

    mean_val, std_val = compute_intensity_stats(img)

    record = ImageRecord(
        id=image_id,
        filename=safe_name,
        stored_filename=stored_filename,
        relative_path=relative_path,
        format=fmt,
        width=width,
        height=height,
        channels=channels,
        color_mode=color_mode,
        file_size=len(content),
        mean_intensity=mean_val,
        std_dev_intensity=std_val,
        is_preprocessed=False,
        parent_image_id=None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("Uploaded image %s (%s, %dx%d)", image_id, safe_name, width, height)
    return record


def get_image_record(db: Session, image_id: str) -> ImageRecord:
    record = db.query(ImageRecord).filter(ImageRecord.id == image_id).first()
    if not record:
        raise HTTPException(status_code=404, detail={
            "error_code": "IMAGE_NOT_FOUND",
            "message": f"Image '{image_id}' was not found.",
        })
    return record


def load_image_array(db: Session, image_id: str, as_grayscale: bool = False) -> tuple[ImageRecord, np.ndarray]:
    record = get_image_record(db, image_id)
    file_path = resolve_storage_path(record.relative_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail={
            "error_code": "IMAGE_FILE_MISSING",
            "message": f"Stored image file for '{image_id}' is missing on disk.",
        })

    flag = cv2.IMREAD_GRAYSCALE if as_grayscale else cv2.IMREAD_UNCHANGED
    img = cv2.imread(str(file_path), flag)
    if img is None:
        raise HTTPException(status_code=500, detail={
            "error_code": "IMAGE_READ_ERROR",
            "message": f"Could not decode image '{image_id}'.",
        })
    if not as_grayscale and img.ndim == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    return record, img


def list_images(db: Session, include_preprocessed: bool = True) -> List[ImageRecord]:
    query = db.query(ImageRecord)
    if not include_preprocessed:
        query = query.filter(ImageRecord.is_preprocessed.is_(False))
    return query.order_by(ImageRecord.created_at.desc()).all()


def delete_image(db: Session, image_id: str) -> None:
    record = get_image_record(db, image_id)
    file_path = resolve_storage_path(record.relative_path)

    # Also find child preprocessed images and delete them cleanly
    children = db.query(ImageRecord).filter(ImageRecord.parent_image_id == image_id).all()
    for child in children:
        child_path = resolve_storage_path(child.relative_path)
        if child_path.exists():
            child_path.unlink(missing_ok=True)
        db.delete(child)

    if file_path.exists():
        file_path.unlink(missing_ok=True)

    db.delete(record)
    db.commit()
    logger.info("Deleted image %s", image_id)


def create_sample_phantom_image(db: Session, sample_type: str) -> ImageRecord:
    """
    Generate real PNG calibration phantoms on disk (Shepp-Logan, Radial Target, Contrast Gradient)
    so users can test mathematical algorithms even before uploading custom files.
    """
    size = 128
    m = np.zeros((size, size), dtype=np.uint8)
    cx, cy = size / 2.0, size / 2.0
    y_grid, x_grid = np.ogrid[:size, :size]

    if sample_type == "shepp_logan":
        name = "shepp_logan_phantom.png"
        skull = ((x_grid - cx) / (size * 0.44)) ** 2 + ((y_grid - cy) / (size * 0.48)) ** 2 <= 1.0
        brain = ((x_grid - cx) / (size * 0.41)) ** 2 + ((y_grid - cy) / (size * 0.45)) ** 2 <= 1.0
        v1 = ((x_grid - (cx - size * 0.11)) / (size * 0.09)) ** 2 + ((y_grid - (cy - size * 0.05)) / (size * 0.18)) ** 2 <= 1.0
        v2 = ((x_grid - (cx + size * 0.11)) / (size * 0.09)) ** 2 + ((y_grid - (cy - size * 0.05)) / (size * 0.18)) ** 2 <= 1.0
        t1 = ((x_grid - (cx - size * 0.18)) / (size * 0.07)) ** 2 + ((y_grid - (cy + size * 0.14)) / (size * 0.07)) ** 2 <= 1.0
        m[skull] = 190
        m[brain] = 55
        m[v1 | v2] = 20
        m[t1] = 135
    elif sample_type == "radial_target":
        name = "radial_resolution_target.png"
        angle = np.arctan2(y_grid - cy, x_grid - cx)
        dist = np.hypot(x_grid - cx, y_grid - cy)
        pattern = (np.sin(angle * 16) * np.sin(dist * 0.45)) > 0
        m[pattern] = 230
        m[~pattern] = 25
    elif sample_type == "histology_cells":
        name = "histology_cell_phantom.png"
        m[:] = 18
        seeds = [
            (0.25, 0.28, 9, 220),
            (0.65, 0.35, 11, 240),
            (0.45, 0.68, 10, 210),
            (0.78, 0.72, 8, 200),
            (0.22, 0.74, 11, 225),
            (0.52, 0.22, 9, 195),
        ]
        acc = np.full((size, size), 18.0, dtype=np.float64)
        for sx, sy, rad, intensity in seeds:
            d2 = (x_grid - sx * size) ** 2 + (y_grid - sy * size) ** 2
            acc += intensity * np.exp(-d2 / (2.0 * rad * rad))
        m = np.clip(acc, 0, 255).astype(np.uint8)
    else:
        raise HTTPException(status_code=400, detail={
            "error_code": "INVALID_SAMPLE",
            "message": f"Unknown sample phantom '{sample_type}'.",
        })

    success, encoded = cv2.imencode(".png", m)
    if not success:
        raise HTTPException(status_code=500, detail={"error_code": "ENCODE_ERROR", "message": "Failed to encode phantom."})
    return save_uploaded_image(db, encoded.tobytes(), name)
