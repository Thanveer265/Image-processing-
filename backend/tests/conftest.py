from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.config import ensure_directories, settings
from app.database import db as db_module
from app.database.db import Base, get_db
from app.main import app
from app.services import job_manager
from app.services.medical_engine import reset_medical_cache


@pytest.fixture()
def test_env(tmp_path: Path, monkeypatch):
    storage_dir = tmp_path / "storage"
    models_dir = tmp_path / "models"
    db_file = tmp_path / "test_imagelab.db"

    monkeypatch.setattr(settings, "STORAGE_DIR", storage_dir.as_posix())
    monkeypatch.setattr(settings, "MODELS_DIR", models_dir.as_posix())
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{db_file.as_posix()}")
    monkeypatch.setattr(settings, "MODEL_EXPECTED_SHA256", "")
    monkeypatch.setattr(settings, "MODEL_AUTO_DOWNLOAD_ON_STARTUP", False)
    reset_medical_cache()

    ensure_directories()

    test_engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={"check_same_thread": False},
        future=True,
    )

    @event.listens_for(test_engine, "connect")
    def _pragma(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON;")
        cur.close()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine, future=True)
    Base.metadata.create_all(bind=test_engine)

    monkeypatch.setattr(db_module, "engine", test_engine)
    monkeypatch.setattr(db_module, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(job_manager, "SessionLocal", TestingSessionLocal)

    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app) as client:
        yield {
            "client": client,
            "db_file": db_file,
            "storage_dir": storage_dir,
            "models_dir": models_dir,
            "session_factory": TestingSessionLocal,
        }

    app.dependency_overrides.clear()
    test_engine.dispose()
