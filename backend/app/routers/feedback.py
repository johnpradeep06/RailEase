from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin, get_current_user

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=schemas.FeedbackOut, status_code=status.HTTP_201_CREATED)
def create_feedback(
    payload: schemas.FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.booking_id is not None:
        booking = db.get(models.Booking, payload.booking_id)
        if booking is None or booking.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Booking not found")

    feedback = models.Feedback(user_id=current_user.id, **payload.model_dump())
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


@router.get("/me", response_model=list[schemas.FeedbackOut])
def list_my_feedback(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    return (
        db.query(models.Feedback)
        .filter(models.Feedback.user_id == current_user.id)
        .order_by(models.Feedback.created_at.desc())
        .all()
    )


@router.put("/{feedback_id}/respond", response_model=schemas.FeedbackOut)
def respond_to_feedback(
    feedback_id: UUID,
    payload: schemas.FeedbackRespond,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    feedback = db.get(models.Feedback, feedback_id)
    if feedback is None:
        raise HTTPException(status_code=404, detail="Feedback not found")
    feedback.admin_response = payload.admin_response
    feedback.status = payload.status
    db.commit()
    db.refresh(feedback)
    return feedback
