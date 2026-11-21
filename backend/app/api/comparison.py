from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.schemas import ComparisonResponse, ComparisonRunRequest
from app.services.evaluation import run_method_comparison

router = APIRouter(prefix="/api/comparison", tags=["Method Comparison"])


@router.post("/run", response_model=ComparisonResponse)
def run_comparison(req: ComparisonRunRequest, db: Session = Depends(get_db)):
    return run_method_comparison(db, req)
