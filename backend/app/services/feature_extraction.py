import json
import time
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import pywt
from scipy.fft import dctn
from scipy.stats import kurtosis, skew
from skimage.feature import graycomatrix, graycoprops, local_binary_pattern
from skimage.measure import shannon_entropy
from sqlalchemy.orm import Session

from app.database.models import FeatureResultRecord
from app.schemas.schemas import FeatureExtractRequest, FeatureExtractResponse, FeatureVectorItem
from app.services.image_service import load_image_array
from app.utils.file_utils import generate_unique_id, resolve_storage_path


def _save_result_png(img_arr: np.ndarray, prefix: str) -> str:
    filename = f"{generate_unique_id(prefix)}.png"
    rel_path = f"results/{filename}"
    dest = resolve_storage_path(rel_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".png", img_arr)
    if ok:
        dest.write_bytes(encoded.tobytes())
    return rel_path


def compute_statistical_features(gray: np.ndarray) -> Dict[str, float]:
    flat = gray.astype(np.float64).ravel()
    mean_val = float(np.mean(flat))
    median_val = float(np.median(flat))
    var_val = float(np.var(flat))
    std_val = float(np.std(flat))
    min_val = float(np.min(flat))
    max_val = float(np.max(flat))
    # Handle constant image cleanly
    skew_val = 0.0 if std_val < 1e-9 else float(skew(flat))
    kurt_val = 0.0 if std_val < 1e-9 else float(kurtosis(flat))
    ent_val = float(shannon_entropy(gray))

    return {
        "mean": round(mean_val, 4),
        "median": round(median_val, 4),
        "variance": round(var_val, 4),
        "std_dev": round(std_val, 4),
        "min": round(min_val, 4),
        "max": round(max_val, 4),
        "skewness": round(skew_val, 4),
        "kurtosis": round(kurt_val, 4),
        "entropy": round(ent_val, 4),
    }


def compute_texture_features(gray: np.ndarray) -> tuple[Dict[str, Any], Dict[str, Any], str, str]:
    # Quantize to 32 gray levels for stable, fast GLCM computation
    quantized = (gray.astype(np.uint16) * 31 // 255).astype(np.uint8)
    distances = [1]
    angles = [0, np.pi / 4, np.pi / 2, 3 * np.pi / 4]
    glcm = graycomatrix(quantized, distances=distances, angles=angles, levels=32, symmetric=True, normed=True)

    contrast = float(np.mean(graycoprops(glcm, "contrast")))
    dissimilarity = float(np.mean(graycoprops(glcm, "dissimilarity")))
    homogeneity = float(np.mean(graycoprops(glcm, "homogeneity")))
    energy = float(np.mean(graycoprops(glcm, "energy")))
    correlation = float(np.mean(graycoprops(glcm, "correlation")))

    # Render GLCM heatmap (averaged across angles)
    glcm_avg = np.mean(glcm[:, :, 0, :], axis=2)
    max_g = float(np.max(glcm_avg)) or 1e-9
    glcm_norm = np.clip((glcm_avg / max_g) * 255.0, 0, 255).astype(np.uint8)
    glcm_resized = cv2.resize(glcm_norm, (128, 128), interpolation=cv2.INTER_NEAREST)
    glcm_color = cv2.applyColorMap(glcm_resized, cv2.COLORMAP_OCEAN)
    glcm_rel_path = _save_result_png(glcm_color, "glcm")

    glcm_stats = {
        "contrast": round(contrast, 4),
        "dissimilarity": round(dissimilarity, 4),
        "homogeneity": round(homogeneity, 4),
        "energy": round(energy, 4),
        "correlation": round(correlation, 4),
    }

    # Local Binary Pattern (uniform, P=8, R=1)
    lbp = local_binary_pattern(gray, P=8, R=1, method="uniform")
    n_bins = 10  # P + 2 for uniform LBP with P=8
    hist, _ = np.histogram(lbp.ravel(), bins=n_bins, range=(0, n_bins))
    hist_norm = hist.astype(np.float64) / (hist.sum() or 1.0)
    lbp_uniformity = float(np.sum(hist_norm ** 2))
    nonzero = hist_norm[hist_norm > 0]
    lbp_entropy = float(-np.sum(nonzero * np.log2(nonzero)))

    lbp_vis = np.clip((lbp / (np.max(lbp) or 1.0)) * 255.0, 0, 255).astype(np.uint8)
    lbp_rel_path = _save_result_png(lbp_vis, "lbp")

    lbp_stats = {
        "uniformity": round(lbp_uniformity, 4),
        "entropy": round(lbp_entropy, 4),
        "histogram": [{"bin": int(i), "count": int(hist[i])} for i in range(n_bins)],
    }

    return glcm_stats, lbp_stats, glcm_rel_path, lbp_rel_path


def compute_edge_features(gray: np.ndarray, canny_low: int = 50, canny_high: int = 150) -> tuple[Dict[str, Any], str, str, str]:
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    sobel_mag = np.hypot(sobel_x, sobel_y)
    sobel_vis = np.clip((sobel_mag / (np.max(sobel_mag) or 1.0)) * 255.0, 0, 255).astype(np.uint8)

    canny_vis = cv2.Canny(gray, threshold1=canny_low, threshold2=canny_high)

    lap = cv2.Laplacian(gray, cv2.CV_64F, ksize=3)
    lap_abs = np.abs(lap)
    lap_vis = np.clip((lap_abs / (np.max(lap_abs) or 1.0)) * 255.0, 0, 255).astype(np.uint8)

    sobel_path = _save_result_png(sobel_vis, "sobel")
    canny_path = _save_result_png(canny_vis, "canny")
    lap_path = _save_result_png(lap_vis, "laplacian")

    edge_pixels = int(np.count_nonzero(canny_vis))
    total_pixels = int(gray.size)
    edge_density = (edge_pixels / (total_pixels or 1)) * 100.0
    sobel_mean = float(np.mean(sobel_mag))

    edge_stats = {
        "edge_pixel_count": edge_pixels,
        "edge_density_percent": round(edge_density, 3),
        "sobel_mean_gradient": round(sobel_mean, 3),
        "canny_thresholds": [canny_low, canny_high],
    }

    return edge_stats, sobel_path, canny_path, lap_path


def compute_shape_features(gray: np.ndarray, apply_threshold: bool = False, threshold_val: Optional[int] = None) -> tuple[Dict[str, Any], Optional[str]]:
    """
    Shape features strictly require a binary mask or segmented foreground region.
    If image is already binary OR apply_threshold=True, extract contours; otherwise explain requirement honestly.
    """
    unique_vals = np.unique(gray)
    is_already_binary = len(unique_vals) <= 2

    if not is_already_binary and not apply_threshold:
        return {
            "region_detected": False,
            "requirement_message": (
                "Shape features require a detected binary region or segmentation mask. "
                "Enable 'Auto Otsu / Threshold Mask' or apply binary thresholding in Image Workspace."
            ),
            "area": None,
            "perimeter": None,
            "circularity": None,
            "aspect_ratio": None,
            "centroid": None,
        }, None

    if is_already_binary:
        mask = np.where(gray > 0, 255, 0).astype(np.uint8)
        mask_source = "existing_binary_mask"
    elif threshold_val is not None:
        _, mask = cv2.threshold(gray, threshold_val, 255, cv2.THRESH_BINARY)
        mask_source = f"manual_threshold({threshold_val})"
    else:
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        mask_source = "otsu_threshold"

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid_contours = [c for c in contours if cv2.contourArea(c) >= 9.0]

    if not valid_contours:
        return {
            "region_detected": False,
            "requirement_message": "No valid foreground contour region was detected in the binary mask.",
            "area": None,
            "perimeter": None,
            "circularity": None,
            "aspect_ratio": None,
            "centroid": None,
        }, None

    largest = max(valid_contours, key=cv2.contourArea)
    area = float(cv2.contourArea(largest))
    perimeter = float(cv2.arcLength(largest, True))
    circularity = (4.0 * np.pi * area) / (perimeter ** 2) if perimeter > 1e-6 else 0.0
    x, y, w, h = cv2.boundingRect(largest)
    aspect_ratio = float(w) / float(h) if h > 0 else 0.0

    moments = cv2.moments(largest)
    if moments["m00"] > 0:
        cx = int(round(moments["m10"] / moments["m00"]))
        cy = int(round(moments["m01"] / moments["m00"]))
    else:
        cx, cy = x + w // 2, y + h // 2

    mask_path = _save_result_png(mask, "shape_mask")

    return {
        "region_detected": True,
        "mask_source": mask_source,
        "contour_count": len(valid_contours),
        "area": round(area, 2),
        "perimeter": round(perimeter, 2),
        "circularity": round(min(1.0, circularity), 4),
        "aspect_ratio": round(aspect_ratio, 4),
        "bounding_box": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
        "centroid": {"x": cx, "y": cy},
    }, mask_path


def compute_frequency_features(gray: np.ndarray) -> Dict[str, Any]:
    arr = gray.astype(np.float64)
    # 2D DCT Type-II orthonormal
    dct_coeffs = dctn(arr, type=2, norm="ortho")
    dct_energies = np.sort((dct_coeffs ** 2).ravel())[::-1]
    total_dct_energy = float(np.sum(dct_energies)) or 1e-9

    n_coeffs = dct_energies.size
    top10_n = max(1, int(round(0.10 * n_coeffs)))
    top20_n = max(1, int(round(0.20 * n_coeffs)))
    dct_top10_pct = float(np.sum(dct_energies[:top10_n]) / total_dct_energy * 100.0)
    dct_top20_pct = float(np.sum(dct_energies[:top20_n]) / total_dct_energy * 100.0)

    # 2D Discrete Wavelet Transform (Haar)
    cA, (cH, cV, cD) = pywt.dwt2(arr, "haar")
    e_ll = float(np.sum(cA ** 2))
    e_lh = float(np.sum(cH ** 2))
    e_hl = float(np.sum(cV ** 2))
    e_hh = float(np.sum(cD ** 2))
    total_wav = e_ll + e_lh + e_hl + e_hh or 1e-9
    high_freq_pct = ((e_lh + e_hl + e_hh) / total_wav) * 100.0

    return {
        "dct_energy_top10_percent": round(dct_top10_pct, 3),
        "dct_energy_top20_percent": round(dct_top20_pct, 3),
        "dct_dc_component": round(float(dct_coeffs[0, 0]), 2),
        "wavelet_family": "haar",
        "wavelet_coefficients_count": int(cA.size + cH.size + cV.size + cD.size),
        "high_freq_energy_percent": round(high_freq_pct, 3),
        "wavelet_subbands_energy": [
            {"band": "LL (Approximation)", "energy": round((e_ll / total_wav) * 100.0, 2)},
            {"band": "LH (Horizontal)", "energy": round((e_lh / total_wav) * 100.0, 2)},
            {"band": "HL (Vertical)", "energy": round((e_hl / total_wav) * 100.0, 2)},
            {"band": "HH (Diagonal)", "energy": round((e_hh / total_wav) * 100.0, 2)},
        ],
    }


def extract_features_for_image(db: Session, req: FeatureExtractRequest) -> FeatureExtractResponse:
    start_time = time.perf_counter()
    record, gray = load_image_array(db, req.image_id, as_grayscale=True)

    stat = compute_statistical_features(gray)
    glcm_stats, lbp_stats, glcm_path, lbp_path = compute_texture_features(gray)
    edge_stats, sobel_path, canny_path, lap_path = compute_edge_features(
        gray, canny_low=req.canny_low, canny_high=req.canny_high
    )
    shape_stats, shape_mask_path = compute_shape_features(
        gray, apply_threshold=req.apply_shape_threshold, threshold_val=req.shape_threshold
    )
    freq_stats = compute_frequency_features(gray)

    # Consistent, fixed-order numerical feature vector (for downstream ML & PCA compatibility!)
    # Shape features are excluded from the fixed vector unless always defined, keeping PCA vector lengths 100% consistent
    vector_items: List[FeatureVectorItem] = [
        FeatureVectorItem(name="stat_mean", category="Statistical", value=stat["mean"]),
        FeatureVectorItem(name="stat_median", category="Statistical", value=stat["median"]),
        FeatureVectorItem(name="stat_variance", category="Statistical", value=stat["variance"]),
        FeatureVectorItem(name="stat_std_dev", category="Statistical", value=stat["std_dev"]),
        FeatureVectorItem(name="stat_min", category="Statistical", value=stat["min"]),
        FeatureVectorItem(name="stat_max", category="Statistical", value=stat["max"]),
        FeatureVectorItem(name="stat_skewness", category="Statistical", value=stat["skewness"]),
        FeatureVectorItem(name="stat_kurtosis", category="Statistical", value=stat["kurtosis"]),
        FeatureVectorItem(name="stat_entropy", category="Statistical", value=stat["entropy"]),
        FeatureVectorItem(name="glcm_contrast", category="Texture", value=glcm_stats["contrast"]),
        FeatureVectorItem(name="glcm_dissimilarity", category="Texture", value=glcm_stats["dissimilarity"]),
        FeatureVectorItem(name="glcm_homogeneity", category="Texture", value=glcm_stats["homogeneity"]),
        FeatureVectorItem(name="glcm_energy", category="Texture", value=glcm_stats["energy"]),
        FeatureVectorItem(name="glcm_correlation", category="Texture", value=glcm_stats["correlation"]),
        FeatureVectorItem(name="lbp_uniformity", category="Texture", value=lbp_stats["uniformity"]),
        FeatureVectorItem(name="lbp_entropy", category="Texture", value=lbp_stats["entropy"]),
        FeatureVectorItem(name="edge_pixel_count", category="Edge", value=float(edge_stats["edge_pixel_count"])),
        FeatureVectorItem(name="edge_density_percent", category="Edge", value=edge_stats["edge_density_percent"]),
        FeatureVectorItem(name="sobel_mean_gradient", category="Edge", value=edge_stats["sobel_mean_gradient"]),
        FeatureVectorItem(name="freq_dct_top10_energy", category="Frequency", value=freq_stats["dct_energy_top10_percent"]),
        FeatureVectorItem(name="freq_dct_top20_energy", category="Frequency", value=freq_stats["dct_energy_top20_percent"]),
        FeatureVectorItem(name="freq_wavelet_high_pct", category="Frequency", value=freq_stats["high_freq_energy_percent"]),
    ]

    feature_names = [v.name for v in vector_items]
    feature_values = [v.value for v in vector_items]

    details = {
        "statistical": stat,
        "glcm": glcm_stats,
        "lbp": lbp_stats,
        "edges": edge_stats,
        "shape": shape_stats,
        "frequency": freq_stats,
    }
    params = req.model_dump()
    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    feat_id = generate_unique_id("feat")
    db_record = FeatureResultRecord(
        id=feat_id,
        image_id=record.id,
        extraction_method=req.extraction_method,
        parameters_json=json.dumps(params),
        feature_names_json=json.dumps(feature_names),
        feature_values_json=json.dumps(feature_values),
        details_json=json.dumps(details),
        edge_sobel_path=sobel_path,
        edge_canny_path=canny_path,
        edge_laplacian_path=lap_path,
        lbp_map_path=lbp_path,
        glcm_map_path=glcm_path,
        shape_mask_path=shape_mask_path,
        processing_time_ms=elapsed_ms,
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    return _build_feature_response(db_record)


def _build_feature_response(db_record: FeatureResultRecord) -> FeatureExtractResponse:
    details = json.loads(db_record.details_json)
    feature_names = json.loads(db_record.feature_names_json)
    feature_values = json.loads(db_record.feature_values_json)
    params = json.loads(db_record.parameters_json)

    cat_map = {
        "stat_": "Statistical",
        "glcm_": "Texture",
        "lbp_": "Texture",
        "edge_": "Edge",
        "sobel_": "Edge",
        "freq_": "Frequency",
    }
    items: List[FeatureVectorItem] = []
    for name, val in zip(feature_names, feature_values):
        cat = "Other"
        for prefix, cname in cat_map.items():
            if name.startswith(prefix):
                cat = cname
                break
        items.append(FeatureVectorItem(name=name, category=cat, value=float(val)))

    def _vis_url(rel: Optional[str]) -> Optional[str]:
        return f"/api/features/artifact/{db_record.id}/{rel.split('/')[-1]}" if rel else None

    visualizations = {
        "sobel": f"/api/features/{db_record.id}/artifact/sobel" if db_record.edge_sobel_path else None,
        "canny": f"/api/features/{db_record.id}/artifact/canny" if db_record.edge_canny_path else None,
        "laplacian": f"/api/features/{db_record.id}/artifact/laplacian" if db_record.edge_laplacian_path else None,
        "lbp": f"/api/features/{db_record.id}/artifact/lbp" if db_record.lbp_map_path else None,
        "glcm": f"/api/features/{db_record.id}/artifact/glcm" if db_record.glcm_map_path else None,
        "shape_mask": f"/api/features/{db_record.id}/artifact/shape_mask" if db_record.shape_mask_path else None,
    }

    return FeatureExtractResponse(
        id=db_record.id,
        image_id=db_record.image_id,
        extraction_method=db_record.extraction_method,
        parameters=params,
        statistical=details.get("statistical"),
        glcm=details.get("glcm"),
        lbp=details.get("lbp"),
        edges=details.get("edges"),
        shape=details.get("shape"),
        frequency=details.get("frequency"),
        feature_names=feature_names,
        feature_values=feature_values,
        feature_vector=items,
        visualizations=visualizations,
        processing_time_ms=db_record.processing_time_ms,
        created_at=db_record.created_at,
    )


def get_latest_features_for_image(db: Session, image_id: str) -> Optional[FeatureExtractResponse]:
    rec = (
        db.query(FeatureResultRecord)
        .filter(FeatureResultRecord.image_id == image_id)
        .order_by(FeatureResultRecord.created_at.desc())
        .first()
    )
    if not rec:
        return None
    return _build_feature_response(rec)
