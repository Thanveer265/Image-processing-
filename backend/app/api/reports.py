from typing import List
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.schemas import ReportGenerateRequest, ReportResponse
from app.services.report_service import generate_report, get_report_file, list_reports

router = APIRouter(prefix="/api/reports", tags=["Reports & Export"])


@router.post("/generate", response_model=ReportResponse)
def create_report(req: ReportGenerateRequest, db: Session = Depends(get_db)):
    return generate_report(db, req)


@router.get("", response_model=List[ReportResponse])
def get_reports(db: Session = Depends(get_db)):
    return list_reports(db)


@router.get("/{report_id}/download")
def download_report(report_id: str, db: Session = Depends(get_db)):
    rec, data, media_type = get_report_file(db, report_id)
    ext = "csv" if rec.format == "csv" else "pdf"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{rec.id}.{ext}"'},
    )
