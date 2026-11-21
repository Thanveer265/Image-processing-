from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.schemas import (
    ImageListResponse,
    ImageResponse,
    PreprocessRequest,
    PreprocessResponse,
)
from app.services.image_service import (
    create_sample_phantom_image,
    delete_image,
    get_image_record,
    list_images,
    save_uploaded_image,
    to_image_response,
)
from app.services.preprocessing import preprocess_image
from app.utils.file_utils import resolve_storage_path

router = APIRouter(prefix="/api/images", tags=["Images & Preprocessing"])


@router.post("/upload", response_model=ImageResponse)
async def upload_image(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    record = save_uploaded_image(db, content, file.filename or "upload.png")
    return to_image_response(record)


@router.post("/sample/{sample_type}", response_model=ImageResponse)
def load_sample_phantom(sample_type: str, db: Session = Depends(get_db)):
    record = create_sample_phantom_image(db, sample_type)
    return to_image_response(record)


@router.get("", response_model=ImageListResponse)
def get_images(
    include_preprocessed: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    rows = list_images(db, include_preprocessed=include_preprocessed)
    return ImageListResponse(
        images=[to_image_response(r) for r in rows],
        total=len(rows),
    )


@router.get("/{image_id}", response_model=ImageResponse)
def get_image_metadata(image_id: str, db: Session = Depends(get_db)):
    record = get_image_record(db, image_id)
    return to_image_response(record)


@router.get("/{image_id}/file")
def get_image_file(image_id: str, db: Session = Depends(get_db)):
    record = get_image_record(db, image_id)
    path = resolve_storage_path(record.relative_path)
    if not path.exists():
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail={"error_code": "IMAGE_FILE_MISSING", "message": "Image file is missing on disk."},
        )
    media_type = "image/png" if record.format.upper() == "PNG" else "image/jpeg"
    return Response(content=path.read_bytes(), media_type=media_type)


@router.delete("/{image_id}")
def remove_image(image_id: str, db: Session = Depends(get_db)):
    delete_image(db, image_id)
    return {"deleted": True, "image_id": image_id}


@router.post("/{image_id}/preprocess", response_model=PreprocessResponse)
def run_preprocessing(image_id: str, req: PreprocessRequest, db: Session = Depends(get_db)):
    return preprocess_image(db, image_id, req)
