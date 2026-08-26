from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("/search", response_model=list[schemas.ScheduleSearchResult])
def search_schedules(
    source: str,
    destination: str,
    journey_date: date,
    db: Session = Depends(get_db),
):
    source_station = db.query(models.Station).filter(models.Station.station_code == source).first()
    destination_station = (
        db.query(models.Station).filter(models.Station.station_code == destination).first()
    )
    if source_station is None or destination_station is None:
        raise HTTPException(status_code=404, detail="Unknown source or destination station code")

    source_stop = aliased(models.RouteStop)
    dest_stop = aliased(models.RouteStop)

    schedules = (
        db.query(models.Schedule)
        .join(source_stop, source_stop.route_id == models.Schedule.route_id)
        .join(dest_stop, dest_stop.route_id == models.Schedule.route_id)
        .filter(
            source_stop.station_id == source_station.id,
            dest_stop.station_id == destination_station.id,
            source_stop.stop_sequence < dest_stop.stop_sequence,
            models.Schedule.journey_date == journey_date,
            models.Schedule.status == models.ScheduleStatus.SCHEDULED,
        )
        .options(joinedload(models.Schedule.train))
        .all()
    )

    results = []
    for schedule in schedules:
        seat_totals = (
            db.query(
                models.Coach.id, models.Coach.coach_type, models.Coach.base_fare, func.count(models.Seat.id)
            )
            .join(models.Seat, models.Seat.coach_id == models.Coach.id)
            .filter(models.Coach.train_id == schedule.train_id)
            .group_by(models.Coach.id)
            .all()
        )
        taken_by_coach = dict(
            db.query(models.Coach.id, func.count(models.BookingSeat.id))
            .join(models.Seat, models.Seat.coach_id == models.Coach.id)
            .join(models.BookingSeat, models.BookingSeat.seat_id == models.Seat.id)
            .filter(
                models.Coach.train_id == schedule.train_id,
                models.BookingSeat.schedule_id == schedule.id,
                models.BookingSeat.status.in_(
                    [models.BookingSeatStatus.RESERVED, models.BookingSeatStatus.CONFIRMED]
                ),
            )
            .group_by(models.Coach.id)
            .all()
        )
        availability = [
            schemas.CoachAvailability(
                coach_type=coach_type,
                base_fare=base_fare,
                total_seats=total,
                available_seats=total - taken_by_coach.get(coach_id, 0),
            )
            for coach_id, coach_type, base_fare, total in seat_totals
        ]
        results.append(
            schemas.ScheduleSearchResult(
                id=schedule.id,
                train=schedule.train,
                journey_date=schedule.journey_date,
                departure_time=schedule.departure_time,
                arrival_time=schedule.arrival_time,
                status=schedule.status,
                coach_availability=availability,
            )
        )
    return results


@router.post("", response_model=schemas.ScheduleOut, status_code=status.HTTP_201_CREATED)
def create_schedule(
    payload: schemas.ScheduleCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    route = db.get(models.Route, payload.route_id)
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    if route.train_id != payload.train_id:
        raise HTTPException(status_code=400, detail="Route does not belong to the given train")

    schedule = models.Schedule(**payload.model_dump())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/{schedule_id}/seats", response_model=list[schemas.CoachSeatMap])
def get_seat_map(
    schedule_id: UUID,
    coach_type: models.CoachType | None = None,
    db: Session = Depends(get_db),
):
    schedule = db.get(models.Schedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    coaches_query = db.query(models.Coach).filter(models.Coach.train_id == schedule.train_id)
    if coach_type is not None:
        coaches_query = coaches_query.filter(models.Coach.coach_type == coach_type)
    coaches = coaches_query.order_by(models.Coach.coach_number).all()

    taken_seat_ids = {
        row[0]
        for row in db.query(models.BookingSeat.seat_id).filter(
            models.BookingSeat.schedule_id == schedule_id,
            models.BookingSeat.status.in_(
                [models.BookingSeatStatus.RESERVED, models.BookingSeatStatus.CONFIRMED]
            ),
        )
    }

    seat_maps = []
    for coach in coaches:
        seats = (
            db.query(models.Seat)
            .filter(models.Seat.coach_id == coach.id)
            .order_by(models.Seat.row_number, models.Seat.column_number)
            .all()
        )
        seat_maps.append(
            schemas.CoachSeatMap(
                coach_id=coach.id,
                coach_number=coach.coach_number,
                coach_type=coach.coach_type,
                base_fare=coach.base_fare,
                seats=[
                    schemas.SeatMapEntry(
                        id=seat.id,
                        seat_number=seat.seat_number,
                        seat_type=seat.seat_type,
                        row_number=seat.row_number,
                        column_number=seat.column_number,
                        status=(
                            schemas.SeatStatus.TAKEN
                            if seat.id in taken_seat_ids
                            else schemas.SeatStatus.AVAILABLE
                        ),
                    )
                    for seat in seats
                ],
            )
        )
    return seat_maps


@router.get("/{schedule_id}", response_model=schemas.ScheduleDetailOut)
def get_schedule(schedule_id: UUID, db: Session = Depends(get_db)):
    schedule = (
        db.query(models.Schedule)
        .options(
            joinedload(models.Schedule.train),
            joinedload(models.Schedule.route)
            .joinedload(models.Route.stops)
            .joinedload(models.RouteStop.station),
        )
        .filter(models.Schedule.id == schedule_id)
        .first()
    )
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule
