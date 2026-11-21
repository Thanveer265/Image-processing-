import time
from typing import List

import numpy as np
from scipy.fft import dctn, idctn
from sqlalchemy.orm import Session

from app.schemas.schemas import (
    ComparisonItem,
    ComparisonResponse,
    ComparisonRunRequest,
    PCATransformRequest,
)
from app.services.feature_extraction import (
    compute_edge_features,
    compute_statistical_features,
    compute_texture_features,
)
from app.services.image_service import load_image_array
from app.services.medical_engine import get_medical_status
from app.services.pca_engine import get_active_pca_model, transform_with_pca
from app.services.svd_engine import decompose_image_svd, reconstruct_image_svd


def run_method_comparison(db: Session, req: ComparisonRunRequest) -> ComparisonResponse:
    """
    Benchmark genuinely comparable mathematical representations and reconstructions on the active image.
    Never mixes classification metrics (accuracy/AUC) with reconstruction metrics (MSE/PSNR).
    """
    total_start = time.perf_counter()
    record, gray = load_image_array(db, req.image_id, as_grayscale=True)
    rows, cols = gray.shape
    raw_bytes_kb = round((rows * cols) / 1024.0, 2)

    items: List[ComparisonItem] = []

    # 1. Raw Image Matrix baseline
    items.append(
        ComparisonItem(
            method="Raw Pixel Matrix",
            category="Baseline",
            dimension=int(rows * cols),
            processing_time_ms=0.01,
            memory_kb=raw_bytes_kb,
            mse=0.0,
            psnr=None,
            retained_energy=100.0,
            compression_ratio=1.0,
            notes="Exact uncompressed spatial matrix (exact reconstruction, MSE=0)",
        )
    )

    # 2. Statistical Descriptors
    t0 = time.perf_counter()
    _ = compute_statistical_features(gray)
    t_stat = round((time.perf_counter() - t0) * 1000.0, 2)
    items.append(
        ComparisonItem(
            method="Statistical Features",
            category="Feature Descriptor",
            dimension=9,
            processing_time_ms=t_stat,
            memory_kb=round((9 * 8) / 1024.0, 4),
            compression_ratio=round((rows * cols) / 9.0, 1),
            notes="Non-invertible summary descriptor (mean, variance, skewness, kurtosis, entropy)",
        )
    )

    # 3. Texture (GLCM + LBP)
    t0 = time.perf_counter()
    _ = compute_texture_features(gray)
    t_tex = round((time.perf_counter() - t0) * 1000.0, 2)
    items.append(
        ComparisonItem(
            method="Texture (GLCM + LBP)",
            category="Feature Descriptor",
            dimension=7,
            processing_time_ms=t_tex,
            memory_kb=round((7 * 8) / 1024.0, 4),
            compression_ratio=round((rows * cols) / 7.0, 1),
            notes="Non-invertible spatial co-occurrence and local binary pattern statistics",
        )
    )

    # 4. Edge Operators
    t0 = time.perf_counter()
    _ = compute_edge_features(gray)
    t_edge = round((time.perf_counter() - t0) * 1000.0, 2)
    items.append(
        ComparisonItem(
            method="Edge Operators (Sobel/Canny)",
            category="Feature Descriptor",
            dimension=3,
            processing_time_ms=t_edge,
            memory_kb=round((3 * 8) / 1024.0, 4),
            compression_ratio=round((rows * cols) / 3.0, 1),
            notes="Gradient magnitude and Canny edge density summary",
        )
    )

    # 5. 2D DCT Energy Compaction & Reconstruction
    t0 = time.perf_counter()
    arr = gray.astype(np.float64)
    coeffs = dctn(arr, type=2, norm="ortho")
    flat_abs = np.abs(coeffs).ravel()
    keep_count = max(1, int(round((req.dct_retention_percent / 100.0) * flat_abs.size)))
    if keep_count < flat_abs.size:
        threshold = np.partition(flat_abs, -keep_count)[-keep_count]
        masked = np.where(np.abs(coeffs) >= threshold, coeffs, 0.0)
    else:
        masked = coeffs
    rec_dct = np.clip(np.rint(idctn(masked, type=2, norm="ortho")), 0, 255).astype(np.uint8)
    dct_mse = float(np.mean((gray.astype(np.float64) - rec_dct.astype(np.float64)) ** 2))
    dct_psnr = None if dct_mse <= 1e-12 else round(float(10.0 * np.log10((255.0 ** 2) / dct_mse)), 2)
    total_e = float(np.sum(coeffs ** 2)) or 1e-12
    dct_energy = round(float(np.sum(masked ** 2) / total_e * 100.0), 2)
    t_dct = round((time.perf_counter() - t0) * 1000.0, 2)
    items.append(
        ComparisonItem(
            method=f"2D DCT (Top {req.dct_retention_percent}% Coeffs)",
            category="Frequency Reconstruction",
            dimension=keep_count,
            processing_time_ms=t_dct,
            memory_kb=round((keep_count * 8) / 1024.0, 2),
            mse=round(dct_mse, 3),
            psnr=dct_psnr,
            retained_energy=dct_energy,
            compression_ratio=round(flat_abs.size / keep_count, 2),
            notes="Orthonormal 2D DCT coefficient truncation reconstruction",
        )
    )

    # 6. SVD Low-Rank Approximation
    svd_rec_meta = decompose_image_svd(db, req.image_id, force_recompute=False)
    effective_rank = min(req.svd_rank, svd_rec_meta.max_rank)
    svd_res = reconstruct_image_svd(db, req.image_id, effective_rank)
    svd_elements = effective_rank * (rows + cols + 1)
    items.append(
        ComparisonItem(
            method=f"SVD Low-Rank (k={effective_rank})",
            category="Matrix Decomposition",
            dimension=effective_rank,
            processing_time_ms=svd_res.processing_time_ms,
            memory_kb=round((svd_elements * 8) / 1024.0, 2),
            mse=round(svd_res.mse, 3),
            psnr=svd_res.psnr,
            retained_energy=svd_res.retained_energy,
            compression_ratio=svd_res.storage_comparison["compression_ratio"],
            notes=f"Rank-{effective_rank}/{svd_rec_meta.max_rank} truncated SVD approximation",
        )
    )

    # 7. PCA Subspace (only if genuinely fitted on >= 2 training samples)
    active_pca = get_active_pca_model(db)
    pca_available = active_pca is not None
    if active_pca is not None:
        pca_res = transform_with_pca(db, PCATransformRequest(image_id=req.image_id))
        items.append(
            ComparisonItem(
                method=f"PCA Subspace ({pca_res.reduced_dimensions} PCs)",
                category="Dimensionality Reduction",
                dimension=pca_res.reduced_dimensions,
                processing_time_ms=pca_res.processing_time_ms,
                memory_kb=round((pca_res.reduced_dimensions * 8) / 1024.0, 4),
                retained_energy=pca_res.total_explained_variance,
                compression_ratio=round(pca_res.input_dimensions / max(1, pca_res.reduced_dimensions), 2),
                notes=f"Projected 22-dim feature vector via fitted model '{active_pca.model_name}'",
            )
        )

    med_status = get_medical_status()
    total_ms = round((time.perf_counter() - total_start) * 1000.0, 2)

    return ComparisonResponse(
        image_id=record.id,
        image_name=record.filename,
        items=items,
        pca_available=pca_available,
        medical_evaluation_available=med_status.classification_configured,
        medical_evaluation_message=(
            "Trained ResNet50 classification model is loaded."
            if med_status.classification_configured
            else "No evaluated medical classifier metrics available: ResNet50 checkpoint is not configured."
        ),
        processing_time_ms=total_ms,
    )
