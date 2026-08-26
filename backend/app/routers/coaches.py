from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin

router = APIRouter(prefix="/coaches", tags=["coaches"])


@router.post("", response_model=schemas.CoachOut, status_code=status.HTTP_201_CREATED)
def create_coach(
    payload: schemas.CoachCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    train = db.get(models.Train, payload.train_id)
    if train is None:
        raise HTTPException(status_code=404, detail="Train not found")
    if (
        db.query(models.Coach)
        .filter(models.Coach.train_id == payload.train_id, models.Coach.coach_number == payload.coach_number)
        .first()
    ):
        raise HTTPException(status_code=400, detail="Coach number already exists on this train")

    coach = models.Coach(**payload.model_dump())
    db.add(coach)
    db.commit()
    db.refresh(coach)
    return coach


@router.post(
    "/{coach_id}/seats", response_model=list[schemas.SeatOut], status_code=status.HTTP_201_CREATED
)
def bulk_create_seats(
    coach_id: UUID,
    payload: schemas.SeatBulkCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    coach = db.get(models.Coach, coach_id)
    if coach is None:
        raise HTTPException(status_code=404, detail="Coach not found")
    if len(payload.seats) > coach.seat_capacity:
        raise HTTPException(status_code=400, detail="Seat count exceeds coach seat_capacity")

    seats = [models.Seat(coach_id=coach_id, **seat_in.model_dump()) for seat_in in payload.seats]
    db.add_all(seats)
    db.commit()
    for seat in seats:
        db.refresh(seat)
    return seats


@router.get("/{coach_id}/seats", response_model=list[schemas.SeatOut])
def list_coach_seats(coach_id: UUID, db: Session = Depends(get_db)):
    coach = db.get(models.Coach, coach_id)
    if coach is None:
        raise HTTPException(status_code=404, detail="Coach not found")
    return (
        db.query(models.Seat)
        .filter(models.Seat.coach_id == coach_id)
        .order_by(models.Seat.row_number, models.Seat.column_number)
        .all()
    )
