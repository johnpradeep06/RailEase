from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..services import booking_service

router = APIRouter(prefix="/bookings", tags=["payments"])


@router.post("/{booking_id}/pay", response_model=schemas.PaymentOut)
def pay_for_booking(
    booking_id: UUID,
    payload: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    booking = db.get(models.Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to pay for this booking")
    if booking.status != models.BookingStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Booking is {booking.status.value}, not payable")

    payment = models.Payment(
        booking_id=booking.id,
        payment_reference=booking_service.generate_payment_reference(),
        amount=booking.total_amount,
        payment_method=payload.payment_method,
        payment_status=models.PaymentStatus.PENDING,
        transaction_time=datetime.now(timezone.utc),
    )
    db.add(payment)
    db.flush()

    # Mock gateway: resolves synchronously here. A real integration would
    # leave this PENDING and flip payment_status via a webhook callback.
    payment_succeeded = True
    if payment_succeeded:
        payment.payment_status = models.PaymentStatus.SUCCESS
        db.commit()
        booking_service.issue_ticket(db, booking)
    else:
        payment.payment_status = models.PaymentStatus.FAILED
        db.commit()

    db.refresh(payment)
    return payment
