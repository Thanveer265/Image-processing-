from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.schemas import MedicalClassifyRequest, MedicalSegmentRequest, MedicalStatusResponse
from app.services.medical_engine import (
    classify_mri,
    classify_uploaded_mri,
    get_medical_status,
    segment_mri,
)

router = APIRouter(prefix="/api/medical", tags=["Medical Image Analysis"])


@router.get("/status", response_model=MedicalStatusResponse)
def medical_status():
    return get_medical_status()


@router.post("/classify")
def medical_classify(req: MedicalClassifyRequest, db: Session = Depends(get_db)):
    return classify_mri(db, req.image_id)


@router.post("/classify/upload")
async def medical_classify_upload(file: UploadFile = File(...)):
    content = await file.read()
    return classify_uploaded_mri(content, file.filename or "upload.png")


@router.post("/segment")
def medical_segment(req: MedicalSegmentRequest, db: Session = Depends(get_db)):
    return segment_mri(db, req.image_id)
