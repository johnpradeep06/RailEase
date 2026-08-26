from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..services import booking_service

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _booking_query(db: Session):
    return db.query(models.Booking).options(
        joinedload(models.Booking.passengers),
        joinedload(models.Booking.booking_seats).joinedload(models.BookingSeat.seat),
    )


@router.post("", response_model=schemas.BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: schemas.BookingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return booking_service.create_booking(db, current_user, payload)


@router.get("/me", response_model=list[schemas.BookingOut])
def list_my_bookings(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    return (
        _booking_query(db)
        .filter(models.Booking.user_id == current_user.id)
        .order_by(models.Booking.created_at.desc())
        .all()
    )


@router.get("/{booking_id}", response_model=schemas.BookingOut)
def get_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    booking = _booking_query(db).filter(models.Booking.id == booking_id).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to view this booking")
    return booking


@router.delete("/{booking_id}", response_model=schemas.BookingOut)
def cancel_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")
    return booking_service.cancel_booking(db, booking)
