import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.database.models import JobRecord
from app.schemas.schemas import JobResponse
from app.utils.file_utils import generate_unique_id

logger = logging.getLogger(__name__)
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="imagelab_job")


def _to_job_response(rec: JobRecord) -> JobResponse:
    return JobResponse(
        id=rec.id,
        job_type=rec.job_type,
        status=rec.status,
        progress_measurable=rec.progress_measurable,
        progress=rec.progress,
        message=rec.message,
        result=json.loads(rec.result_json) if rec.result_json else None,
        error_details=rec.error_details,
        created_at=rec.created_at,
        started_at=rec.started_at,
        completed_at=rec.completed_at,
    )


def submit_background_job(
    db: Session,
    job_type: str,
    worker_fn: Callable[[Session], Any],
    initial_message: str = "Job queued for background execution.",
    progress_measurable: bool = False,
) -> JobResponse:
    job_id = generate_unique_id("job")
    rec = JobRecord(
        id=job_id,
        job_type=job_type,
        status="QUEUED",
        progress_measurable=progress_measurable,
        progress=0.0 if progress_measurable else None,
        message=initial_message,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    def _run():
        bg_db = SessionLocal()
        try:
            job = bg_db.query(JobRecord).filter(JobRecord.id == job_id).first()
            if not job or job.status == "CANCELLED":
                return
            job.status = "RUNNING"
            job.started_at = datetime.now(timezone.utc)
            job.message = f"Executing {job_type}..."
            bg_db.commit()

            result = worker_fn(bg_db)

            job = bg_db.query(JobRecord).filter(JobRecord.id == job_id).first()
            if job and job.status != "CANCELLED":
                job.status = "COMPLETED"
                if job.progress_measurable:
                    job.progress = 100.0
                job.message = f"{job_type} completed successfully."
                job.result_json = json.dumps(result)
                job.completed_at = datetime.now(timezone.utc)
                bg_db.commit()
        except Exception as exc:
            logger.exception("Background job %s failed", job_id)
            job = bg_db.query(JobRecord).filter(JobRecord.id == job_id).first()
            if job:
                job.status = "FAILED"
                job.error_details = str(exc)
                job.message = f"{job_type} failed."
                job.completed_at = datetime.now(timezone.utc)
                bg_db.commit()
        finally:
            bg_db.close()

    _EXECUTOR.submit(_run)
    return _to_job_response(rec)


def get_job_status(db: Session, job_id: str) -> JobResponse:
    rec = db.query(JobRecord).filter(JobRecord.id == job_id).first()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "JOB_NOT_FOUND", "message": f"Background job '{job_id}' was not found."},
        )
    return _to_job_response(rec)


def cancel_job(db: Session, job_id: str) -> JobResponse:
    rec = db.query(JobRecord).filter(JobRecord.id == job_id).first()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "JOB_NOT_FOUND", "message": f"Background job '{job_id}' was not found."},
        )
    if rec.status in ("QUEUED", "RUNNING"):
        rec.status = "CANCELLED"
        rec.message = "Job cancelled by user."
        rec.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(rec)
    return _to_job_response(rec)
