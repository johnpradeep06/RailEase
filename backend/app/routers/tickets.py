from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("/{booking_id}", response_model=schemas.TicketOut)
def get_ticket(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    booking = db.get(models.Booking, booking_id)
    if booking is None or booking.ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if booking.user_id != current_user.id and current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")
    return booking.ticket
