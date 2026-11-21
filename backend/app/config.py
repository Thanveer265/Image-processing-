import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "ImageLab Backend"
    APP_VERSION: str = "1.0.0"
    HOST: str = "127.0.0.1"
    PORT: int = 8001
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    MAX_UPLOAD_SIZE_MB: int = 20
    DATABASE_URL: str = f"sqlite:///{(BACKEND_ROOT / 'imagelab.db').as_posix()}"
    STORAGE_DIR: str = (BACKEND_ROOT / "storage").as_posix()
    MODELS_DIR: str = (BACKEND_ROOT / "app" / "models").as_posix()
    LOG_LEVEL: str = "INFO"

    # Server-side Google Drive checkpoint download & integrity verification settings
    GOOGLE_DRIVE_FILE_ID: str = ""
    GOOGLE_DRIVE_CREDENTIALS_PATH: str = ""
    GOOGLE_DRIVE_CREDENTIALS_JSON: str = ""
    GOOGLE_DRIVE_ACCESS_TOKEN: str = ""
    MODEL_EXPECTED_SHA256: str = ""
    MODEL_MIN_SIZE_BYTES: int = 10_000_000
    MODEL_MAX_SIZE_BYTES: int = 500_000_000
    MODEL_AUTO_DOWNLOAD_ON_STARTUP: bool = False
    MODEL_PRELOAD_ON_STARTUP: bool = True

    model_config = SettingsConfigDict(
        env_file=(BACKEND_ROOT / ".env").as_posix(),
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> List[str]:
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        app_url = os.environ.get("APP_URL")
        if app_url and app_url not in origins:
            origins.append(app_url)
        return origins

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def storage_path(self) -> Path:
        return Path(self.STORAGE_DIR)

    @property
    def uploads_path(self) -> Path:
        return self.storage_path / "uploads"

    @property
    def processed_path(self) -> Path:
        return self.storage_path / "processed"

    @property
    def results_path(self) -> Path:
        return self.storage_path / "results"

    @property
    def reports_path(self) -> Path:
        return self.storage_path / "reports"

    @property
    def models_path(self) -> Path:
        return Path(self.MODELS_DIR)

    @property
    def classification_models_path(self) -> Path:
        return self.models_path / "classification"

    @property
    def segmentation_models_path(self) -> Path:
        return self.models_path / "segmentation"


settings = Settings()


def ensure_directories() -> None:
    for p in [
        settings.uploads_path,
        settings.processed_path,
        settings.results_path,
        settings.reports_path,
        settings.classification_models_path,
        settings.segmentation_models_path,
    ]:
        p.mkdir(parents=True, exist_ok=True)
