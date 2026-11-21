import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database.models import FeatureResultRecord
from app.schemas.schemas import FeatureExtractRequest, FeatureExtractResponse
from app.services.feature_extraction import extract_features_for_image, get_latest_features_for_image
from app.services.image_service import get_image_record
from app.utils.file_utils import resolve_storage_path

router = APIRouter(prefix="/api/features", tags=["Feature Extraction"])


@router.post("/extract", response_model=FeatureExtractResponse)
def extract_features(req: FeatureExtractRequest, db: Session = Depends(get_db)):
    return extract_features_for_image(db, req)


@router.get("/{image_id}", response_model=FeatureExtractResponse)
def get_features(image_id: str, db: Session = Depends(get_db)):
    get_image_record(db, image_id)
    res = get_latest_features_for_image(db, image_id)
    if not res:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": "FEATURES_NOT_FOUND",
                "message": f"No extracted features found for image '{image_id}'. Run extraction first.",
            },
        )
    return res


@router.get("/{feature_id}/artifact/{kind}")
def get_feature_artifact(feature_id: str, kind: str, db: Session = Depends(get_db)):
    rec = db.query(FeatureResultRecord).filter(FeatureResultRecord.id == feature_id).first()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "FEATURE_RESULT_NOT_FOUND", "message": "Feature result not found."},
        )
    path_map = {
        "sobel": rec.edge_sobel_path,
        "canny": rec.edge_canny_path,
        "laplacian": rec.edge_laplacian_path,
        "lbp": rec.lbp_map_path,
        "glcm": rec.glcm_map_path,
        "shape_mask": rec.shape_mask_path,
    }
    if kind not in path_map:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "INVALID_ARTIFACT_KIND", "message": f"Unsupported artifact kind '{kind}'."},
        )
    rel_path = path_map[kind]
    if not rel_path:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "ARTIFACT_NOT_AVAILABLE", "message": f"Artifact '{kind}' was not generated for this result."},
        )
    abs_path = resolve_storage_path(rel_path)
    if not abs_path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error_code": "ARTIFACT_FILE_MISSING", "message": "Artifact file is missing on disk."},
        )
    return Response(content=abs_path.read_bytes(), media_type="image/png")


@router.get("/{image_id}/csv")
def export_features_csv(image_id: str, db: Session = Depends(get_db)):
    get_image_record(db, image_id)
    res = get_latest_features_for_image(db, image_id)
    if not res:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "FEATURES_NOT_FOUND", "message": "Extract features before exporting CSV."},
        )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["image_id", "feature_name", "category", "value"])
    for item in res.feature_vector:
        writer.writerow([image_id, item.name, item.category, item.value])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="features_{image_id}.csv"'},
    )
