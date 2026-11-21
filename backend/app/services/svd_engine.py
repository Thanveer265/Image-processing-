import json
import time
from typing import Tuple

import cv2
import numpy as np
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.models import SVDResultRecord
from app.schemas.schemas import SVDReconstructResponse, SVDStatusResponse
from app.services.image_service import load_image_array
from app.utils.file_utils import generate_unique_id, resolve_storage_path


def _build_cumulative_energy(singular_values: np.ndarray) -> list[dict]:
    s2 = singular_values ** 2
    total = float(np.sum(s2)) or 1e-12
    cum = np.cumsum(s2) / total * 100.0
    n = len(singular_values)
    if n <= 64:
        indices = list(range(n))
    else:
        idx_set = set(range(60))
        for threshold in (90.0, 95.0, 99.0):
            hits = np.where(cum >= threshold)[0]
            if len(hits) > 0:
                idx_set.add(int(hits[0]))
        idx_set.add(n - 1)
        indices = sorted(idx_set)
    return [
        {
            "rank": i + 1,
            "singularValue": round(float(singular_values[i]), 3),
            "energy": round(float(min(100.0, cum[i])), 3),
        }
        for i in indices
    ]


def decompose_image_svd(db: Session, image_id: str, force_recompute: bool = False) -> SVDResultRecord:
    """
    Compute NumPy SVD (A = U * Sigma * V^T) on the grayscale image matrix and cache U, S, Vt to disk.
    """
    existing = (
        db.query(SVDResultRecord)
        .filter(SVDResultRecord.image_id == image_id)
        .order_by(SVDResultRecord.created_at.desc())
        .first()
    )
    if existing and not force_recompute:
        cache_path = resolve_storage_path(existing.cache_relative_path)
        if cache_path.exists():
            return existing

    start_time = time.perf_counter()
    record, gray = load_image_array(db, image_id, as_grayscale=True)
    A = gray.astype(np.float64)
    rows, cols = A.shape

    U, S, Vt = np.linalg.svd(A, full_matrices=False)
    max_rank = int(len(S))
    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    svd_id = generate_unique_id("svd")
    cache_rel = f"results/{svd_id}_cache.npz"
    cache_path = resolve_storage_path(cache_rel)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache_path, A=A, U=U, S=S, Vt=Vt)

    if existing:
        # Clean up previous cache
        old_cache = resolve_storage_path(existing.cache_relative_path)
        if old_cache.exists():
            old_cache.unlink(missing_ok=True)
        db.delete(existing)
        db.flush()

    svd_record = SVDResultRecord(
        id=svd_id,
        image_id=record.id,
        matrix_rows=int(rows),
        matrix_cols=int(cols),
        max_rank=max_rank,
        singular_values_json=json.dumps([round(float(v), 4) for v in S]),
        cache_relative_path=cache_rel,
        decompose_time_ms=elapsed_ms,
    )
    db.add(svd_record)
    db.commit()
    db.refresh(svd_record)
    return svd_record


def reconstruct_image_svd(db: Session, image_id: str, rank: int) -> SVDReconstructResponse:
    """
    Reconstruct rank-k approximation A_k = U[:, :k] * S[:k] @ Vt[:k, :] from cached SVD.
    Never recomputes full SVD when rank changes.
    """
    svd_record = decompose_image_svd(db, image_id, force_recompute=False)
    if rank < 1 or rank > svd_record.max_rank:
        raise HTTPException(status_code=400, detail={
            "error_code": "INVALID_RANK",
            "message": f"Rank k={rank} is out of bounds. Valid range for this image is [1, {svd_record.max_rank}].",
        })

    start_time = time.perf_counter()
    cache_path = resolve_storage_path(svd_record.cache_relative_path)
    data = np.load(cache_path)
    A = data["A"]
    U = data["U"]
    S = data["S"]
    Vt = data["Vt"]

    # Rank-k matrix multiplication
    A_k = (U[:, :rank] * S[:rank]) @ Vt[:rank, :]
    A_k_clipped = np.clip(np.rint(A_k), 0, 255).astype(np.uint8)
    A_orig_u8 = np.clip(np.rint(A), 0, 255).astype(np.uint8)

    # Retained Energy = sum(S[:k]^2) / sum(S^2) * 100
    s2 = S ** 2
    total_energy = float(np.sum(s2)) or 1e-12
    retained_energy = round(float(np.sum(s2[:rank]) / total_energy * 100.0), 4)

    # MSE and PSNR
    diff_f = A_orig_u8.astype(np.float64) - A_k_clipped.astype(np.float64)
    mse = float(np.mean(diff_f ** 2))
    exact_reconstruction = mse <= 1e-12
    psnr = None if exact_reconstruction else round(float(10.0 * np.log10((255.0 ** 2) / mse)), 3)

    # Difference heatmap visualization (amplified residual)
    abs_diff = np.abs(diff_f)
    max_diff = max(25.0, float(np.max(abs_diff)))
    norm_diff = np.clip((abs_diff / max_diff) * 255.0, 0, 255).astype(np.uint8)
    diff_heatmap = cv2.applyColorMap(norm_diff, cv2.COLORMAP_INFERNO)

    rec_rel = f"results/{svd_record.id}_rec_k{rank}.png"
    diff_rel = f"results/{svd_record.id}_diff_k{rank}.png"

    rec_path = resolve_storage_path(rec_rel)
    diff_path = resolve_storage_path(diff_rel)
    cv2.imwrite(str(rec_path), A_k_clipped)
    cv2.imwrite(str(diff_path), diff_heatmap)

    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    svd_record.last_rank = rank
    svd_record.last_retained_energy = retained_energy
    svd_record.last_mse = round(mse, 4)
    svd_record.last_psnr = psnr
    svd_record.last_reconstructed_path = rec_rel
    svd_record.last_difference_path = diff_rel
    db.commit()
    db.refresh(svd_record)

    rows, cols = svd_record.matrix_rows, svd_record.matrix_cols
    original_elements = rows * cols
    compressed_elements = rank * (rows + cols + 1)
    compression_ratio = round(original_elements / compressed_elements, 3)
    savings_pct = round(max(0.0, (1.0 - compressed_elements / original_elements) * 100.0), 2)

    sr = min(4, rows)
    sc = min(4, rank)
    u_sample = [[round(float(U[r, c]), 4) for c in range(sc)] for r in range(sr)]
    v_sample = [[round(float(Vt[c, r]), 4) for c in range(sc)] for r in range(min(4, cols))]

    return SVDReconstructResponse(
        svd_id=svd_record.id,
        image_id=image_id,
        rank=rank,
        max_rank=svd_record.max_rank,
        matrix_rows=rows,
        matrix_cols=cols,
        singular_values=[round(float(v), 3) for v in S[:64]],
        cumulative_energy=_build_cumulative_energy(S),
        retained_energy=round(retained_energy, 2),
        mse=round(mse, 4),
        psnr=psnr,
        exact_reconstruction=exact_reconstruction,
        original_url=f"/api/images/{image_id}/file",
        reconstructed_url=f"/api/svd/{svd_record.id}/artifact/reconstructed/{rank}",
        difference_url=f"/api/svd/{svd_record.id}/artifact/difference/{rank}",
        storage_comparison={
            "original_elements": original_elements,
            "compressed_elements": compressed_elements,
            "compression_ratio": compression_ratio,
            "storage_savings_percent": savings_pct,
        },
        u_sample=u_sample,
        v_sample=v_sample,
        processing_time_ms=elapsed_ms,
    )


def get_svd_status(db: Session, image_id: str) -> SVDStatusResponse:
    rec = (
        db.query(SVDResultRecord)
        .filter(SVDResultRecord.image_id == image_id)
        .order_by(SVDResultRecord.created_at.desc())
        .first()
    )
    if not rec:
        return SVDStatusResponse(decomposed=False, image_id=image_id)

    s_vals = np.array(json.loads(rec.singular_values_json), dtype=np.float64)
    return SVDStatusResponse(
        decomposed=True,
        svd_id=rec.id,
        image_id=image_id,
        matrix_rows=rec.matrix_rows,
        matrix_cols=rec.matrix_cols,
        max_rank=rec.max_rank,
        singular_values=[round(float(v), 3) for v in s_vals[:64]],
        cumulative_energy=_build_cumulative_energy(s_vals),
        last_rank=rec.last_rank,
        last_retained_energy=rec.last_retained_energy,
        last_mse=rec.last_mse,
        last_psnr=rec.last_psnr,
        decompose_time_ms=rec.decompose_time_ms,
    )
