from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.schemas import ExperimentCreateRequest, ExperimentResponse
from app.services.experiment_service import (
    create_experiment,
    delete_experiment,
    get_experiment,
    list_experiments,
)

router = APIRouter(prefix="/api/experiments", tags=["Experiments"])


@router.get("", response_model=List[ExperimentResponse])
def get_all_experiments(db: Session = Depends(get_db)):
    return list_experiments(db)


@router.post("", response_model=ExperimentResponse)
def save_experiment(req: ExperimentCreateRequest, db: Session = Depends(get_db)):
    return create_experiment(db, req)


@router.get("/{experiment_id}", response_model=ExperimentResponse)
def get_single_experiment(experiment_id: str, db: Session = Depends(get_db)):
    return get_experiment(db, experiment_id)


@router.delete("/{experiment_id}")
def remove_experiment(experiment_id: str, db: Session = Depends(get_db)):
    delete_experiment(db, experiment_id)
    return {"deleted": True, "experiment_id": experiment_id}
