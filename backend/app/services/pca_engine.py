import json
import pickle
import time
from typing import List, Optional

import numpy as np
from fastapi import HTTPException
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from app.database.models import FeatureResultRecord, PCAModelRecord
from app.schemas.schemas import (
    FeatureExtractRequest,
    PCAFitRequest,
    PCAFitResponse,
    PCAStatusResponse,
    PCATransformRequest,
    PCATransformResponse,
)
from app.services.feature_extraction import extract_features_for_image
from app.services.image_service import get_image_record
from app.utils.file_utils import generate_unique_id, resolve_storage_path


def fit_pca_model(db: Session, req: PCAFitRequest) -> PCAFitResponse:
    """
    Fit StandardScaler and PCA on a multi-sample feature matrix (training samples only).
    Persists fitted scaler + PCA model on disk and metadata in SQLite for reuse.
    """
    start_time = time.perf_counter()

    X_rows: List[List[float]] = []
    feature_names: List[str] = []
    used_image_ids: List[str] = []

    if req.image_ids and len(req.image_ids) > 0:
        if len(req.image_ids) < 2:
            raise HTTPException(status_code=400, detail={
                "error_code": "INSUFFICIENT_SAMPLES",
                "message": "PCA requires at least 2 images/samples in the training feature dataset.",
            })

        for img_id in req.image_ids:
            # Verify image exists
            get_image_record(db, img_id)
            feat_rec = (
                db.query(FeatureResultRecord)
                .filter(FeatureResultRecord.image_id == img_id)
                .order_by(FeatureResultRecord.created_at.desc())
                .first()
            )
            if feat_rec:
                names = json.loads(feat_rec.feature_names_json)
                vals = json.loads(feat_rec.feature_values_json)
            else:
                extracted = extract_features_for_image(
                    db, FeatureExtractRequest(image_id=img_id, extraction_method="comprehensive")
                )
                names = extracted.feature_names
                vals = extracted.feature_values

            if not feature_names:
                feature_names = names
            elif names != feature_names:
                raise HTTPException(status_code=400, detail={
                    "error_code": "INCOMPATIBLE_FEATURES",
                    "message": f"Image '{img_id}' has incompatible feature names or ordering.",
                })

            X_rows.append(vals)
            used_image_ids.append(img_id)

    elif req.feature_matrix and len(req.feature_matrix) > 0:
        if len(req.feature_matrix) < 2:
            raise HTTPException(status_code=400, detail={
                "error_code": "INSUFFICIENT_SAMPLES",
                "message": "PCA feature_matrix must contain at least 2 samples.",
            })
        n_cols = len(req.feature_matrix[0])
        if n_cols == 0 or any(len(row) != n_cols for row in req.feature_matrix):
            raise HTTPException(status_code=400, detail={
                "error_code": "INVALID_FEATURE_MATRIX",
                "message": "All rows in feature_matrix must have identical non-zero length.",
            })
        X_rows = req.feature_matrix
        feature_names = req.feature_names if (req.feature_names and len(req.feature_names) == n_cols) else [
            f"feature_{i+1}" for i in range(n_cols)
        ]
    else:
        raise HTTPException(status_code=400, detail={
            "error_code": "MISSING_DATASET",
            "message": "Provide at least 2 image_ids or a multi-sample feature_matrix to fit PCA.",
        })

    X = np.array(X_rows, dtype=np.float64)
    if np.isnan(X).any() or np.isinf(X).any():
        raise HTTPException(status_code=400, detail={
            "error_code": "INVALID_NUMERICS",
            "message": "Feature matrix contains NaN or infinite values.",
        })

    n_samples, n_features = X.shape
    max_possible = min(n_samples, n_features)

    # Fit StandardScaler strictly on training data
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Determine PCA parameter (n_components vs variance_threshold)
    if req.variance_threshold is not None:
        pca_param = float(req.variance_threshold)
    elif req.n_components is not None:
        if req.n_components > max_possible:
            raise HTTPException(status_code=400, detail={
                "error_code": "INVALID_N_COMPONENTS",
                "message": f"n_components={req.n_components} exceeds min(n_samples={n_samples}, n_features={n_features})={max_possible}.",
            })
        pca_param = int(req.n_components)
    else:
        pca_param = min(5, max_possible)

    pca = PCA(n_components=pca_param, svd_solver="full")
    X_reduced = pca.fit_transform(X_scaled)

    explained_ratios = [round(float(r) * 100.0, 4) for r in pca.explained_variance_ratio_]
    cum_list = []
    running = 0.0
    for idx, r in enumerate(explained_ratios):
        running = min(100.0, running + r)
        cum_list.append({
            "component": idx + 1,
            "variance": round(r, 2),
            "cumulative": round(running, 2),
        })
    total_explained = round(sum(explained_ratios), 2)

    model_id = generate_unique_id("pca")
    artifact_rel = f"results/{model_id}.pkl"
    artifact_path = resolve_storage_path(artifact_rel)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)

    with open(artifact_path, "wb") as f:
        pickle.dump(
            {
                "scaler": scaler,
                "pca": pca,
                "feature_names": feature_names,
            },
            f,
        )

    # Mark prior PCA models inactive and persist this active model
    db.query(PCAModelRecord).update({"is_active": False})
    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    record = PCAModelRecord(
        id=model_id,
        model_name=req.model_name,
        image_ids_json=json.dumps(used_image_ids),
        feature_names_json=json.dumps(feature_names),
        n_samples=int(n_samples),
        n_features=int(n_features),
        n_components=int(pca.n_components_),
        variance_threshold=req.variance_threshold,
        explained_variance_ratio_json=json.dumps(explained_ratios),
        cumulative_variance_json=json.dumps(cum_list),
        total_explained_variance=total_explained,
        artifact_relative_path=artifact_rel,
        is_active=True,
        processing_time_ms=elapsed_ms,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return PCAFitResponse(
        model_id=record.id,
        model_name=record.model_name,
        n_samples=record.n_samples,
        n_features=record.n_features,
        n_components=record.n_components,
        feature_names=feature_names,
        explained_variance_ratio=explained_ratios,
        cumulative_variance=cum_list,
        total_explained_variance=total_explained,
        reduced_training_vectors=[[round(float(v), 4) for v in row] for row in X_reduced],
        processing_time_ms=elapsed_ms,
        created_at=record.created_at,
    )


def get_active_pca_model(db: Session) -> Optional[PCAModelRecord]:
    return (
        db.query(PCAModelRecord)
        .filter(PCAModelRecord.is_active.is_(True))
        .order_by(PCAModelRecord.created_at.desc())
        .first()
    )


def get_pca_status(db: Session) -> PCAStatusResponse:
    record = get_active_pca_model(db)
    if not record:
        return PCAStatusResponse(fitted=False)
    return PCAStatusResponse(
        fitted=True,
        model_id=record.id,
        model_name=record.model_name,
        n_samples=record.n_samples,
        n_features=record.n_features,
        n_components=record.n_components,
        feature_names=json.loads(record.feature_names_json),
        explained_variance_ratio=json.loads(record.explained_variance_ratio_json),
        cumulative_variance=json.loads(record.cumulative_variance_json),
        total_explained_variance=record.total_explained_variance,
        created_at=record.created_at,
    )


def transform_with_pca(db: Session, req: PCATransformRequest) -> PCATransformResponse:
    start_time = time.perf_counter()
    record = get_active_pca_model(db)
    if not record:
        raise HTTPException(status_code=400, detail={
            "error_code": "PCA_NOT_FITTED",
            "message": "No fitted PCA model exists. Fit PCA on a multi-image feature dataset first.",
        })

    artifact_path = resolve_storage_path(record.artifact_relative_path)
    if not artifact_path.exists():
        raise HTTPException(status_code=500, detail={
            "error_code": "PCA_ARTIFACT_MISSING",
            "message": "Fitted PCA artifact file is missing on disk. Please refit PCA.",
        })

    with open(artifact_path, "rb") as f:
        bundle = pickle.load(f)

    scaler: StandardScaler = bundle["scaler"]
    pca: PCA = bundle["pca"]
    expected_names: List[str] = bundle["feature_names"]

    if req.image_id:
        feat_rec = (
            db.query(FeatureResultRecord)
            .filter(FeatureResultRecord.image_id == req.image_id)
            .order_by(FeatureResultRecord.created_at.desc())
            .first()
        )
        if feat_rec:
            names = json.loads(feat_rec.feature_names_json)
            vec = json.loads(feat_rec.feature_values_json)
        else:
            extracted = extract_features_for_image(
                db, FeatureExtractRequest(image_id=req.image_id, extraction_method="comprehensive")
            )
            names = extracted.feature_names
            vec = extracted.feature_values
    elif req.feature_vector is not None:
        vec = req.feature_vector
        names = req.feature_names or expected_names
    else:
        raise HTTPException(status_code=400, detail={
            "error_code": "MISSING_INPUT",
            "message": "Provide either image_id or feature_vector for PCA transformation.",
        })

    if len(vec) != len(expected_names) or names != expected_names:
        raise HTTPException(status_code=400, detail={
            "error_code": "INCOMPATIBLE_FEATURES",
            "message": f"Input feature vector ({len(vec)} dims) does not match fitted PCA schema ({len(expected_names)} dims).",
        })

    X_input = np.array([vec], dtype=np.float64)
    X_scaled = scaler.transform(X_input)
    X_reduced = pca.transform(X_scaled)[0]

    elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    return PCATransformResponse(
        model_id=record.id,
        image_id=req.image_id,
        input_dimensions=len(vec),
        reduced_dimensions=int(pca.n_components_),
        original_vector=[round(float(v), 4) for v in vec],
        reduced_vector=[round(float(v), 4) for v in X_reduced],
        explained_variance_ratio=json.loads(record.explained_variance_ratio_json),
        cumulative_variance=json.loads(record.cumulative_variance_json),
        total_explained_variance=record.total_explained_variance,
        processing_time_ms=elapsed_ms,
    )
