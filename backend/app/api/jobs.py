from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.schemas import ComparisonRunRequest, JobResponse
from app.services.evaluation import run_method_comparison
from app.services.image_service import get_image_record
from app.services.job_manager import cancel_job, get_job_status, submit_background_job

router = APIRouter(prefix="/api/jobs", tags=["Background Jobs"])


@router.post("/comparison", response_model=JobResponse)
def submit_comparison_job(req: ComparisonRunRequest, db: Session = Depends(get_db)):
    get_image_record(db, req.image_id)
    return submit_background_job(
        db=db,
        job_type="METHOD_COMPARISON",
        worker_fn=lambda bg_db: run_method_comparison(bg_db, req).model_dump(mode="json"),
        initial_message="Queued mathematical method benchmark.",
        progress_measurable=False,
    )


@router.get("/{job_id}", response_model=JobResponse)
def fetch_job_status(job_id: str, db: Session = Depends(get_db)):
    return get_job_status(db, job_id)


@router.post("/{job_id}/cancel", response_model=JobResponse)
def cancel_background_job(job_id: str, db: Session = Depends(get_db)):
    return cancel_job(db, job_id)
