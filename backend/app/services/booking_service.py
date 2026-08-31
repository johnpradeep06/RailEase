import random
import string
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas


def _generate_reference(prefix: str, length: int = 10) -> str:
    chars = string.ascii_uppercase + string.digits
    return prefix + "".join(random.choices(chars, k=length))


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


def reserve_specific_seats(
    db: Session, schedule: models.Schedule, seat_ids: list
) -> list[tuple[models.Seat, Decimal]]:
    """Lock exactly the seats the customer picked in the seat map.

    SKIP LOCKED means a seat concurrently being claimed by another in-flight
    booking simply drops out of the result set here (rather than blocking),
    which we then report as "no longer available" alongside seats that were
    already committed as taken.
    """
    taken_seat_ids = select(models.BookingSeat.seat_id).where(
        models.BookingSeat.schedule_id == schedule.id,
        models.BookingSeat.status.in_(
            [models.BookingSeatStatus.RESERVED, models.BookingSeatStatus.CONFIRMED]
        ),
    )

    rows = (
        db.query(models.Seat, models.Coach.base_fare)
        .join(models.Coach, models.Coach.id == models.Seat.coach_id)
        .filter(
            models.Seat.id.in_(seat_ids),
            models.Coach.train_id == schedule.train_id,
            models.Seat.id.notin_(taken_seat_ids),
        )
        .with_for_update(of=models.Seat, skip_locked=True)
        .all()
    )

    found = {seat.id: (seat, fare) for seat, fare in rows}
    missing = [str(seat_id) for seat_id in seat_ids if seat_id not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Seat(s) no longer available, please re-select: {', '.join(missing)}",
        )

    # Preserve the caller's order so passengers[i] lines up with seat_ids[i].
    return [found[seat_id] for seat_id in seat_ids]


def create_booking(db: Session, user: models.User, payload: schemas.BookingCreate) -> models.Booking:
    schedule = db.get(models.Schedule, payload.schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if schedule.status != models.ScheduleStatus.SCHEDULED:
        raise HTTPException(status_code=400, detail="Schedule is not open for booking")

    _assert_valid_segment(db, schedule.route_id, payload.source_station_id, payload.destination_station_id)

    reserved = reserve_specific_seats(db, schedule, payload.seat_ids)

    booking = models.Booking(
        booking_reference=_generate_reference("BK"),
        user_id=user.id,
        schedule_id=schedule.id,
        source_station_id=payload.source_station_id,
        destination_station_id=payload.destination_station_id,
        total_amount=sum((fare for _, fare in reserved), Decimal("0")),
        status=models.BookingStatus.PENDING,
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
    db.refresh(booking)
    return booking


def cancel_booking(db: Session, booking: models.Booking) -> models.Booking:
    if booking.status == models.BookingStatus.CANCELLED:
        return booking

    booking.status = models.BookingStatus.CANCELLED
    for booking_seat in booking.booking_seats:
        if booking_seat.status != models.BookingSeatStatus.CANCELLED:
            booking_seat.status = models.BookingSeatStatus.CANCELLED

    if booking.ticket is not None and booking.ticket.ticket_status == models.TicketStatus.ACTIVE:
        booking.ticket.ticket_status = models.TicketStatus.CANCELLED
        booking.ticket.cancelled_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(booking)
    return booking


def issue_ticket(db: Session, booking: models.Booking) -> models.Ticket:
    booking.status = models.BookingStatus.CONFIRMED
    for booking_seat in booking.booking_seats:
        booking_seat.status = models.BookingSeatStatus.CONFIRMED

    ticket = models.Ticket(
        booking_id=booking.id,
        ticket_number=_generate_reference("TCK"),
        ticket_status=models.TicketStatus.ACTIVE,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def generate_payment_reference() -> str:
    return _generate_reference("PAY")
