from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin

router = APIRouter(prefix="/trains", tags=["trains"])


@router.get("", response_model=list[schemas.TrainOut])
def list_trains(db: Session = Depends(get_db)):
    return db.query(models.Train).order_by(models.Train.train_number).all()


@router.post("", response_model=schemas.TrainOut, status_code=status.HTTP_201_CREATED)
def create_train(
    payload: schemas.TrainCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    if db.query(models.Train).filter(models.Train.train_number == payload.train_number).first():
        raise HTTPException(status_code=400, detail="Train number already exists")
    train = models.Train(**payload.model_dump())
    db.add(train)
    db.commit()
    db.refresh(train)
    return train


@router.get("/{train_id}", response_model=schemas.TrainOut)
def get_train(train_id: UUID, db: Session = Depends(get_db)):
    train = db.get(models.Train, train_id)
    if train is None:
        raise HTTPException(status_code=404, detail="Train not found")
    return train


@router.get("/{train_id}/coaches", response_model=list[schemas.CoachOut])
def list_train_coaches(train_id: UUID, db: Session = Depends(get_db)):
    train = db.get(models.Train, train_id)
    if train is None:
        raise HTTPException(status_code=404, detail="Train not found")
    return (
        db.query(models.Coach)
        .filter(models.Coach.train_id == train_id)
        .order_by(models.Coach.coach_number)
        .all()
    )
