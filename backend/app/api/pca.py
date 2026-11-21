from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.schemas import (
    PCAFitRequest,
    PCAFitResponse,
    PCAStatusResponse,
    PCATransformRequest,
    PCATransformResponse,
)
from app.services.pca_engine import fit_pca_model, get_pca_status, transform_with_pca

router = APIRouter(prefix="/api/pca", tags=["PCA Dimensionality Reduction"])


@router.post("/fit", response_model=PCAFitResponse)
def fit_pca(req: PCAFitRequest, db: Session = Depends(get_db)):
    return fit_pca_model(db, req)


@router.post("/transform", response_model=PCATransformResponse)
def transform_pca(req: PCATransformRequest, db: Session = Depends(get_db)):
    return transform_with_pca(db, req)


@router.get("/status", response_model=PCAStatusResponse)
def pca_status(db: Session = Depends(get_db)):
    return get_pca_status(db)
