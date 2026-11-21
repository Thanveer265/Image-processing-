import json
from datetime import datetime, timezone
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.models import ExperimentRecord
from app.schemas.schemas import ExperimentCreateRequest, ExperimentResponse
from app.utils.file_utils import generate_unique_id


def _to_experiment_response(rec: ExperimentRecord) -> ExperimentResponse:
    return ExperimentResponse(
        id=rec.id,
        name=rec.name,
        input_image_ids=json.loads(rec.input_image_ids_json),
        dataset_name=rec.dataset_name,
        selected_methods=json.loads(rec.selected_methods_json),
        primary_method=rec.primary_method,
        processing_params=json.loads(rec.processing_params_json),
        feature_settings=json.loads(rec.feature_settings_json),
        pca_settings=json.loads(rec.pca_settings_json),
        svd_rank=rec.svd_rank,
        results=json.loads(rec.results_json),
        metrics=json.loads(rec.metrics_json),
        model_version=rec.model_version,
        status=rec.status,
        error_details=rec.error_details,
        notes=rec.notes,
        created_at=rec.created_at,
        completed_at=rec.completed_at,
    )


def create_experiment(db: Session, req: ExperimentCreateRequest) -> ExperimentResponse:
    exp_id = generate_unique_id("exp")
    now = datetime.now(timezone.utc)
    rec = ExperimentRecord(
        id=exp_id,
        name=req.name,
        input_image_ids_json=json.dumps(req.input_image_ids),
        dataset_name=req.dataset_name,
        selected_methods_json=json.dumps(req.selected_methods or [req.primary_method]),
        primary_method=req.primary_method,
        processing_params_json=json.dumps(req.processing_params),
        feature_settings_json=json.dumps(req.feature_settings),
        pca_settings_json=json.dumps(req.pca_settings),
        svd_rank=req.svd_rank,
        results_json=json.dumps(req.results),
        metrics_json=json.dumps(req.metrics),
        model_version=req.model_version,
        status="COMPLETED",
        notes=req.notes,
        completed_at=now,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _to_experiment_response(rec)


def list_experiments(db: Session) -> List[ExperimentResponse]:
    rows = db.query(ExperimentRecord).order_by(ExperimentRecord.created_at.desc()).all()
    return [_to_experiment_response(r) for r in rows]


def get_experiment(db: Session, experiment_id: str) -> ExperimentResponse:
    rec = db.query(ExperimentRecord).filter(ExperimentRecord.id == experiment_id).first()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "EXPERIMENT_NOT_FOUND", "message": f"Experiment '{experiment_id}' was not found."},
        )
    return _to_experiment_response(rec)


def delete_experiment(db: Session, experiment_id: str) -> None:
    rec = db.query(ExperimentRecord).filter(ExperimentRecord.id == experiment_id).first()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "EXPERIMENT_NOT_FOUND", "message": f"Experiment '{experiment_id}' was not found."},
        )
    db.delete(rec)
    db.commit()
