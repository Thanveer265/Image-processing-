import json
import time
from typing import List

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.database.models import ImageRecord, PreprocessingRecord
from app.schemas.schemas import PreprocessRequest, PreprocessResponse
from app.services.image_service import (
    compute_intensity_stats,
    load_image_array,
    to_image_response,
)
from app.utils.file_utils import generate_unique_id, resolve_storage_path


def preprocess_image(db: Session, image_id: str, req: PreprocessRequest) -> PreprocessResponse:
    start_time = time.perf_counter()
    source_record, img = load_image_array(db, image_id, as_grayscale=False)

    applied_ops: List[str] = []
    work = img.copy()

    # 1. Color space conversion
    if req.grayscale:
        if work.ndim == 3:
            work = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
        applied_ops.append("grayscale_conversion")
    elif req.operation == "rgb":
        if work.ndim == 2:
            work = cv2.cvtColor(work, cv2.COLOR_GRAY2BGR)
        applied_ops.append("rgb_conversion")

    # 2. Resize
    curr_h, curr_w = work.shape[:2]
    if req.resize_width is not None or req.resize_height is not None:
        if req.keep_aspect_ratio:
            if req.resize_width is not None and req.resize_height is None:
                new_w = req.resize_width
                new_h = max(16, int(round(curr_h * (new_w / curr_w))))
            elif req.resize_height is not None and req.resize_width is None:
                new_h = req.resize_height
                new_w = max(16, int(round(curr_w * (new_h / curr_h))))
            else:
                # Fit within bounding box preserving aspect ratio
                scale = min(req.resize_width / curr_w, req.resize_height / curr_h)
                new_w = max(16, int(round(curr_w * scale)))
                new_h = max(16, int(round(curr_h * scale)))
        else:
            new_w = req.resize_width or curr_w
            new_h = req.resize_height or curr_h

        if (new_w, new_h) != (curr_w, curr_h):
            interp = cv2.INTER_AREA if (new_w < curr_w or new_h < curr_h) else cv2.INTER_CUBIC
            work = cv2.resize(work, (new_w, new_h), interpolation=interp)
            applied_ops.append(f"resize({new_w}x{new_h})")

    # 3. Denoising
    if req.denoise_method == "gaussian":
        ksize = req.denoise_strength if req.denoise_strength % 2 == 1 else req.denoise_strength + 1
        ksize = max(3, min(15, ksize))
        work = cv2.GaussianBlur(work, (ksize, ksize), 0)
        applied_ops.append(f"gaussian_denoise(k={ksize})")
    elif req.denoise_method == "median":
        ksize = req.denoise_strength if req.denoise_strength % 2 == 1 else req.denoise_strength + 1
        ksize = max(3, min(15, ksize))
        work = cv2.medianBlur(work, ksize)
        applied_ops.append(f"median_denoise(k={ksize})")

    # 4. Brightness and Contrast adjustment
    if req.brightness != 0 or req.contrast != 0:
        alpha = (259.0 * (req.contrast + 255.0)) / (255.0 * (259.0 - req.contrast))
        beta = (req.brightness / 100.0) * 127.0
        work_f = work.astype(np.float32)
        work_f = alpha * (work_f - 128.0) + 128.0 + beta
        work = np.clip(work_f, 0, 255).astype(np.uint8)
        if req.contrast != 0:
            applied_ops.append(f"contrast({req.contrast:+d})")
        if req.brightness != 0:
            applied_ops.append(f"brightness({req.brightness:+d})")

    # 5. CLAHE (Contrast Limited Adaptive Histogram Equalization)
    if req.clahe_enabled:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        if work.ndim == 2:
            work = clahe.apply(work)
        else:
            lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB)
            l_ch, a_ch, b_ch = cv2.split(lab)
            l_eq = clahe.apply(l_ch)
            work = cv2.cvtColor(cv2.merge((l_eq, a_ch, b_ch)), cv2.COLOR_LAB2BGR)
        applied_ops.append("clahe")

    # 6. Intensity Normalization
    if req.normalization == "minmax":
        work_f = work.astype(np.float32)
        min_v = float(np.min(work_f))
        max_v = float(np.max(work_f))
        if max_v > min_v:
            work = np.clip(((work_f - min_v) / (max_v - min_v)) * 255.0, 0, 255).astype(np.uint8)
        applied_ops.append("minmax_normalization")
    elif req.normalization == "standardization":
        work_f = work.astype(np.float32)
        mean_v = float(np.mean(work_f))
        std_v = float(np.std(work_f)) or 1.0
        z = (work_f - mean_v) / std_v
        # Map [-3, +3] sigma into [0, 255] uint8 image space for visualization & matrix storage
        work = np.clip(128.0 + z * 42.5, 0, 255).astype(np.uint8)
        applied_ops.append("zscore_standardization")

    # 7. Optional binary thresholding
    if req.threshold_enabled:
        gray_for_thresh = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY) if work.ndim == 3 else work
        _, work = cv2.threshold(gray_for_thresh, req.threshold_value, 255, cv2.THRESH_BINARY)
        applied_ops.append(f"binary_threshold(t={req.threshold_value})")

    if not applied_ops:
        applied_ops.append("identity_copy")

    # Save processed image safely in storage/processed/
    processed_id = generate_unique_id("img")
    record_id = generate_unique_id("prep")
    stored_filename = f"{processed_id}.png"
    relative_path = f"processed/{stored_filename}"
    dest_path = resolve_storage_path(relative_path)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    success, encoded = cv2.imencode(".png", work)
    if not success:
        raise RuntimeError("Failed to encode preprocessed image.")
    raw_bytes = encoded.tobytes()
    dest_path.write_bytes(raw_bytes)

    out_h, out_w = work.shape[:2]
    out_ch = 1 if work.ndim == 2 else work.shape[2]
    color_mode = "grayscale" if out_ch == 1 else "rgb"
    mean_val, std_val = compute_intensity_stats(work)

    base_stem = source_record.filename.rsplit(".", 1)[0]
    processed_display_name = f"{base_stem}_preprocessed.png"

    processed_img_record = ImageRecord(
        id=processed_id,
        filename=processed_display_name,
        stored_filename=stored_filename,
        relative_path=relative_path,
        format="PNG",
        width=int(out_w),
        height=int(out_h),
        channels=int(out_ch),
        color_mode=color_mode,
        file_size=len(raw_bytes),
        mean_intensity=mean_val,
        std_dev_intensity=std_val,
        is_preprocessed=True,
        parent_image_id=source_record.id,
    )
    db.add(processed_img_record)
    db.flush()

    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    prep_record = PreprocessingRecord(
        id=record_id,
        source_image_id=source_record.id,
        processed_image_id=processed_id,
        relative_path=relative_path,
        parameters_json=req.model_dump_json(),
        applied_operations_json=json.dumps(applied_ops),
        output_width=int(out_w),
        output_height=int(out_h),
        output_channels=int(out_ch),
        processing_time_ms=elapsed_ms,
    )
    db.add(prep_record)
    db.commit()
    db.refresh(processed_img_record)

    return PreprocessResponse(
        record_id=record_id,
        source_image_id=source_record.id,
        processed_image_id=processed_id,
        processed_image_url=f"/api/images/{processed_id}/file",
        output_width=int(out_w),
        output_height=int(out_h),
        output_channels=int(out_ch),
        applied_operations=applied_ops,
        processing_time_ms=elapsed_ms,
        image=to_image_response(processed_img_record),
    )
