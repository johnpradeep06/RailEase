"""Booking lifecycle: seat locking, expiry, cancellation, payment settlement.

Seat-lock model (see docs/PAYMENTS_AND_SEAT_LOCKING.md):

  POST /bookings  ->  Booking PENDING + BookingSeat RESERVED, expires_at = now + SEAT_LOCK_MINUTES
  payment verified -> Booking CONFIRMED + BookingSeat CONFIRMED + Ticket       (one transaction)
  cancel / fail    -> Booking CANCELLED, seats released
  lock deadline    -> Booking EXPIRED,   seats released   (lazy check + background sweeper)

Double-booking is prevented in three independent layers:
  1. row locks on the seat rows, taken in a fixed order, then a *fresh* check;
  2. the partial unique index uq_active_seat_per_schedule (the real guarantee);
  3. IntegrityError -> clean 409 instead of a 500.
"""
import random
import string
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from .. import models, razorpay_client as rz, schemas
from ..config import settings

ACTIVE_SEAT = (models.BookingSeatStatus.RESERVED, models.BookingSeatStatus.CONFIRMED)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _generate_reference(prefix: str, length: int = 10) -> str:
    chars = string.ascii_uppercase + string.digits
    return prefix + "".join(random.choices(chars, k=length))


def generate_payment_reference() -> str:
    return _generate_reference("PAY")


def paise(amount: Decimal) -> int:
    return int((Decimal(amount) * 100).to_integral_value())


def _assert_valid_segment(db: Session, route_id, source_station_id, destination_station_id) -> None:
    stops = {
        stop.station_id: stop.stop_sequence
        for stop in db.query(models.RouteStop).filter(
            models.RouteStop.route_id == route_id,
            models.RouteStop.station_id.in_([source_station_id, destination_station_id]),
        )
    }
    source_seq = stops.get(source_station_id)
    dest_seq = stops.get(destination_station_id)
    if source_seq is None or dest_seq is None:
        raise HTTPException(status_code=400, detail="Source/destination is not on this train's route")
    if source_seq >= dest_seq:
        raise HTTPException(status_code=400, detail="Source station must come before destination station")


# ---------------------------------------------------------------------------
# Seat-lock expiry
# ---------------------------------------------------------------------------


def _bulk_seats(db: Session, booking_id, from_status, to_status) -> None:
    db.execute(
        update(models.BookingSeat)
        .where(models.BookingSeat.booking_id == booking_id, models.BookingSeat.status == from_status)
        .values(status=to_status)
        .execution_options(synchronize_session=False)
    )


def release_pending(db: Session, booking: models.Booking, new_status: models.BookingStatus, reason: str) -> None:
    """Give a PENDING booking's seats back to the pool. Caller commits."""
    booking.status = new_status
    _bulk_seats(db, booking.id, models.BookingSeatStatus.RESERVED, models.BookingSeatStatus.CANCELLED)
    db.execute(
        update(models.Payment)
        .where(
            models.Payment.booking_id == booking.id,
            models.Payment.payment_status == models.PaymentStatus.PENDING,
        )
        .values(payment_status=models.PaymentStatus.FAILED, failure_reason=reason)
        .execution_options(synchronize_session=False)
    )


def expire_stale_holds(db: Session) -> int:
    """Release every PENDING booking whose lock deadline has passed.

    Called lazily by every endpoint that reads or writes seat availability and
    periodically by a background task, so correctness never depends on the
    sweeper being alive. Rows currently locked by another transaction (e.g. a
    payment being confirmed right now) are skipped, never waited on.
    """
    ids = (
        db.execute(
            select(models.Booking.id)
            .where(
                models.Booking.status == models.BookingStatus.PENDING,
                models.Booking.expires_at.is_not(None),
                models.Booking.expires_at < utcnow(),
            )
            .order_by(models.Booking.id)
            .with_for_update(skip_locked=True)
        )
        .scalars()
        .all()
    )
    if ids:
        db.execute(
            update(models.Booking)
            .where(models.Booking.id.in_(ids))
            .values(status=models.BookingStatus.EXPIRED)
            .execution_options(synchronize_session=False)
        )
        db.execute(
            update(models.BookingSeat)
            .where(
                models.BookingSeat.booking_id.in_(ids),
                models.BookingSeat.status == models.BookingSeatStatus.RESERVED,
            )
            .values(status=models.BookingSeatStatus.CANCELLED)
            .execution_options(synchronize_session=False)
        )
        db.execute(
            update(models.Payment)
            .where(
                models.Payment.booking_id.in_(ids),
                models.Payment.payment_status == models.PaymentStatus.PENDING,
            )
            .values(
                payment_status=models.PaymentStatus.FAILED,
                failure_reason="Seat lock expired before payment completed",
            )
            .execution_options(synchronize_session=False)
        )
    db.commit()
    return len(ids)


# ---------------------------------------------------------------------------
# Reserving seats
# ---------------------------------------------------------------------------


def reserve_specific_seats(
    db: Session, schedule: models.Schedule, seat_ids: list
) -> list[tuple[models.Seat, Decimal]]:
    """Lock exactly the seats the customer picked and make sure they are free.

    1. Lock the seat rows (blocking, in id order -> no deadlocks). Concurrent
       bookings that want any of the same seats queue up here.
    2. Only then check availability in a *new statement* — by now the previous
       holder has committed, so its reservation is visible and we lose cleanly.
       (Checking inside the locking query would use a stale snapshot.)
    """
    db.execute(text("SET LOCAL lock_timeout = '5s'"))

    rows = (
        db.query(models.Seat, models.Coach.base_fare)
        .join(models.Coach, models.Coach.id == models.Seat.coach_id)
        .filter(models.Seat.id.in_(seat_ids), models.Coach.train_id == schedule.train_id)
        .order_by(models.Seat.id)
        .with_for_update(of=models.Seat)
        .all()
    )
    found = {seat.id: (seat, fare) for seat, fare in rows}
    unknown = [str(s) for s in seat_ids if s not in found]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Seat(s) not on this train: {', '.join(unknown)}")

    taken = {
        row[0]
        for row in db.query(models.BookingSeat.seat_id).filter(
            models.BookingSeat.schedule_id == schedule.id,
            models.BookingSeat.seat_id.in_(seat_ids),
            models.BookingSeat.status.in_(ACTIVE_SEAT),
        )
    }
    if taken:
        raise HTTPException(
            status_code=409,
            detail=f"Seat(s) no longer available, please re-select: {', '.join(str(s) for s in taken)}",
        )

    # Preserve the caller's order so passengers[i] lines up with seat_ids[i].
    return [found[seat_id] for seat_id in seat_ids]


def create_booking(db: Session, user: models.User, payload: schemas.BookingCreate) -> models.Booking:
    expire_stale_holds(db)  # seats whose lock lapsed are free again, right now

    schedule = db.get(models.Schedule, payload.schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if schedule.status != models.ScheduleStatus.SCHEDULED:
        raise HTTPException(status_code=400, detail="Schedule is not open for booking")

    _assert_valid_segment(db, schedule.route_id, payload.source_station_id, payload.destination_station_id)

    try:
        reserved = reserve_specific_seats(db, schedule, payload.seat_ids)

        booking = models.Booking(
            booking_reference=_generate_reference("BK"),
            user_id=user.id,
            schedule_id=schedule.id,
            source_station_id=payload.source_station_id,
            destination_station_id=payload.destination_station_id,
            total_amount=sum((fare for _, fare in reserved), Decimal("0")),
            status=models.BookingStatus.PENDING,
            expires_at=utcnow() + timedelta(minutes=settings.seat_lock_minutes),
        )
        db.add(booking)
        db.flush()

        for (seat, fare), passenger_in in zip(reserved, payload.passengers):
            passenger_data = passenger_in.model_dump()
            # Chair-car seats have no berth level — ignore any berth preference the
            # client sent so we never store a meaningless value for them.
            if seat.seat_type == models.SeatType.SEAT:
                passenger_data["berth_preference"] = models.BerthPreference.NO_PREFERENCE
            passenger = models.Passenger(booking_id=booking.id, **passenger_data)
            db.add(passenger)
            db.flush()
            db.add(
                models.BookingSeat(
                    booking_id=booking.id,
                    schedule_id=schedule.id,
                    seat_id=seat.id,
                    passenger_id=passenger.id,
                    fare=fare,
                    status=models.BookingSeatStatus.RESERVED,
                )
            )

        db.commit()
    except HTTPException:
        db.rollback()  # release the seat row locks immediately
        raise
    except IntegrityError:
        # Lost the race at the database constraint (uq_active_seat_per_schedule).
        db.rollback()
        raise HTTPException(status_code=409, detail="Seat(s) no longer available, please re-select")
    except OperationalError:
        # lock_timeout: another booking for these seats is still mid-flight.
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Those seats are being booked by someone else right now — try again"
        )

    db.refresh(booking)
    return booking


# ---------------------------------------------------------------------------
# Cancellation / ticketing / payment settlement
# ---------------------------------------------------------------------------


def cancel_booking(db: Session, booking: models.Booking) -> models.Booking:
    db.refresh(booking, with_for_update=True)  # serialise with a payment being confirmed

    if booking.status in (models.BookingStatus.CANCELLED, models.BookingStatus.EXPIRED):
        db.commit()
        return booking

    if booking.status == models.BookingStatus.PENDING:
        release_pending(db, booking, models.BookingStatus.CANCELLED, "Booking cancelled by the customer")
    else:
        booking.status = models.BookingStatus.CANCELLED
        for booking_seat in booking.booking_seats:
            if booking_seat.status != models.BookingSeatStatus.CANCELLED:
                booking_seat.status = models.BookingSeatStatus.CANCELLED
        if booking.ticket is not None and booking.ticket.ticket_status == models.TicketStatus.ACTIVE:
            booking.ticket.ticket_status = models.TicketStatus.CANCELLED
            booking.ticket.cancelled_at = utcnow()

    db.commit()
    db.refresh(booking)
    return booking


def issue_ticket(db: Session, booking: models.Booking) -> None:
    """Confirm the booking and its seats and issue the ticket. Caller commits."""
    booking.status = models.BookingStatus.CONFIRMED
    _bulk_seats(db, booking.id, models.BookingSeatStatus.RESERVED, models.BookingSeatStatus.CONFIRMED)
    if booking.ticket is None:
        db.add(
            models.Ticket(
                booking_id=booking.id,
                ticket_number=_generate_reference("TCK"),
                ticket_status=models.TicketStatus.ACTIVE,
            )
        )


def mark_paid(
    db: Session,
    booking: models.Booking,
    payment: models.Payment,
    *,
    razorpay_payment_id: str | None = None,
    method: models.PaymentMethod | None = None,
) -> None:
    payment.payment_status = models.PaymentStatus.SUCCESS
    payment.transaction_time = utcnow()
    payment.failure_reason = None
    if razorpay_payment_id:
        payment.razorpay_payment_id = razorpay_payment_id
    if method:
        payment.payment_method = method
    issue_ticket(db, booking)


def _reinstate_seats(db: Session, booking: models.Booking) -> bool:
    """Try to take back the seats of an EXPIRED booking. False if someone else has them."""
    try:
        with db.begin_nested():  # SAVEPOINT: a unique violation undoes only this
            _bulk_seats(db, booking.id, models.BookingSeatStatus.CANCELLED, models.BookingSeatStatus.RESERVED)
            db.flush()
    except IntegrityError:
        return False
    return True


def apply_captured_payment(
    db: Session, booking: models.Booking, payment: models.Payment, gateway_payment: dict
) -> str:
    """Settle a payment the gateway reports as captured. Idempotent. Commits.

    The caller must hold the booking row lock (SELECT ... FOR UPDATE) and have
    already checked the signature / amount.  Returns:
      'confirmed'      booking is CONFIRMED (now, or already)
      'refunded'       paid too late and the seats are gone -> money returned
      'refund_failed'  paid too late, seats gone, automatic refund also failed
    """
    rp_id = gateway_payment["id"]
    method = rz.map_method(gateway_payment.get("method"))

    if booking.status == models.BookingStatus.CONFIRMED:  # verify + webhook both landed
        db.commit()
        return "confirmed"

    # The deadline may have passed in the last instant, before the sweeper noticed.
    if (
        booking.status == models.BookingStatus.PENDING
        and booking.expires_at is not None
        and booking.expires_at < utcnow()
    ):
        release_pending(db, booking, models.BookingStatus.EXPIRED, "Seat lock expired before payment completed")

    if booking.status == models.BookingStatus.PENDING:
        mark_paid(db, booking, payment, razorpay_payment_id=rp_id, method=method)
        db.commit()
        return "confirmed"

    # Money arrived after the lock lapsed. Honour it if the seats are still free…
    if booking.status == models.BookingStatus.EXPIRED and _reinstate_seats(db, booking):
        mark_paid(db, booking, payment, razorpay_payment_id=rp_id, method=method)
        db.commit()
        return "confirmed"

    # …otherwise (seats taken, or the customer had cancelled) return the money.
    payment.razorpay_payment_id = rp_id
    payment.payment_method = method
    try:
        rz.refund_payment(rp_id, paise(payment.amount), {"booking": booking.booking_reference})
        payment.payment_status = models.PaymentStatus.REFUNDED
        payment.failure_reason = "Paid after the seat lock ended and the seats were no longer free — refunded."
        outcome = "refunded"
    except rz.RazorpayError as e:
        payment.payment_status = models.PaymentStatus.FAILED
        payment.failure_reason = f"Paid after the seat lock ended; automatic refund failed ({e}) — refund manually."
        outcome = "refund_failed"
    db.commit()
    return outcome
