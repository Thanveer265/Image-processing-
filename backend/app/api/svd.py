from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database.models import SVDResultRecord
from app.schemas.schemas import (
    SVDDecomposeRequest,
    SVDReconstructRequest,
    SVDReconstructResponse,
    SVDStatusResponse,
)
from app.services.image_service import get_image_record
from app.services.svd_engine import decompose_image_svd, get_svd_status, reconstruct_image_svd
from app.utils.file_utils import resolve_storage_path

router = APIRouter(prefix="/api/svd", tags=["SVD Matrix Decomposition"])


@router.post("/decompose", response_model=SVDStatusResponse)
def decompose_svd(req: SVDDecomposeRequest, db: Session = Depends(get_db)):
    decompose_image_svd(db, req.image_id, force_recompute=req.force_recompute)
    return get_svd_status(db, req.image_id)


@router.post("/reconstruct", response_model=SVDReconstructResponse)
def reconstruct_svd(req: SVDReconstructRequest, db: Session = Depends(get_db)):
    return reconstruct_image_svd(db, req.image_id, req.rank)


@router.get("/{image_id}/status", response_model=SVDStatusResponse)
def svd_status(image_id: str, db: Session = Depends(get_db)):
    get_image_record(db, image_id)
    return get_svd_status(db, image_id)


@router.get("/{svd_id}/artifact/{kind}/{rank}")
def get_svd_artifact(svd_id: str, kind: str, rank: int, db: Session = Depends(get_db)):
    rec = db.query(SVDResultRecord).filter(SVDResultRecord.id == svd_id).first()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "SVD_NOT_FOUND", "message": "SVD record was not found."},
        )
    if kind not in ("reconstructed", "difference"):
        raise HTTPException(
            status_code=400,
            detail={"error_code": "INVALID_ARTIFACT_KIND", "message": "Artifact kind must be reconstructed or difference."},
        )
    if rank < 1 or rank > rec.max_rank:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "INVALID_RANK", "message": "Rank out of bounds."},
        )
    prefix = "rec" if kind == "reconstructed" else "diff"
    rel_path = f"results/{rec.id}_{prefix}_k{rank}.png"
    abs_path = resolve_storage_path(rel_path)
    if not abs_path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error_code": "ARTIFACT_NOT_FOUND", "message": "Requested rank artifact has not been generated yet."},
        )
    return Response(content=abs_path.read_bytes(), media_type="image/png")
