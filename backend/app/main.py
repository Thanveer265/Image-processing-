import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import comparison, experiments, features, images, jobs, medical, pca, reports, svd
from app.config import ensure_directories, settings
from app.database.db import SessionLocal, init_db
from app.schemas.schemas import HealthResponse
from app.services.medical_engine import get_medical_status, preload_classification_model

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("imagelab.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_directories()
    init_db()
    preload_classification_model()
    med = get_medical_status()
    logger.info(
        "ImageLab Backend started (medical_classification_configured=%s, model_loaded_in_memory=%s)",
        med.classification_configured,
        med.model_loaded_in_memory,
    )
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Scientific Image Feature Extraction, PCA Dimensionality Reduction, SVD Decomposition, and Medical MRI Research Backend.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        payload = {
            "error_code": exc.detail.get("error_code", "HTTP_ERROR"),
            "message": exc.detail.get("message", "Request error"),
            "detail": exc.detail.get("detail"),
        }
    else:
        payload = {
            "error_code": "HTTP_ERROR",
            "message": str(exc.detail),
            "detail": None,
        }
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error_code": "VALIDATION_ERROR",
            "message": "Invalid request payload or parameters.",
            "detail": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled backend exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error_code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected internal processing error occurred.",
            "detail": None,
        },
    )


@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    db_ok = False
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False

    med = get_medical_status()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        database_connected=db_ok,
        medical_model_configured=med.classification_configured,
        timestamp=datetime.now(timezone.utc),
    )


app.include_router(images.router)
app.include_router(features.router)
app.include_router(pca.router)
app.include_router(svd.router)
app.include_router(medical.router)
app.include_router(comparison.router)
app.include_router(experiments.router)
app.include_router(jobs.router)
app.include_router(reports.router)
