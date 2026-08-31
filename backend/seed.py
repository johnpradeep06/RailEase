"""Idempotent dev seed: admin + demo customer, stations, a train with a route,
a full rake of coaches (5x 3AC, 4x SL, 2x CC) each with a seat grid, and three
schedules.

Run against whatever DATABASE_URL points to (Railway tunnel, or as a Railway
one-off job):

    cd backend && env/Scripts/python seed.py

Safe to run repeatedly — every row is looked up by its natural key first.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from app.database import SessionLocal
from app import models
from app.security import hash_password

# --- seat grid templates -------------------------------------------------------
# column -> berth level, mirroring Seat.column_number semantics in models.py
SLEEPER_BAY = {
    1: models.SeatType.LOWER, 2: models.SeatType.MIDDLE, 3: models.SeatType.UPPER,
    4: models.SeatType.LOWER, 5: models.SeatType.MIDDLE, 6: models.SeatType.UPPER,
    7: models.SeatType.SIDE_LOWER, 8: models.SeatType.SIDE_UPPER,
}
AC3_BAY = SLEEPER_BAY  # same 6 + 2-side layout


def get_or_create(db, model, defaults=None, **lookup):
    obj = db.query(model).filter_by(**lookup).first()
    if obj:
        return obj, False
    obj = model(**lookup, **(defaults or {}))
    db.add(obj)
    db.flush()
    return obj, True


def seat_rows_for_coach(coach_type, capacity):
    """Yield (seat_number, seat_type, row_number, column_number)."""
    if coach_type == models.CoachType.CHAIR_CAR:
        per_row = 6
        for i in range(capacity):
            row, col = i // per_row + 1, i % per_row + 1
            yield f"{row}{'ABCDEF'[col - 1]}", models.SeatType.SEAT, row, col
    else:
        bay = AC3_BAY if coach_type == models.CoachType.AC_THIRD else SLEEPER_BAY
        per_bay = len(bay)
        for i in range(capacity):
            row, col = i // per_bay + 1, i % per_bay + 1
            yield f"{i + 1}", bay[col], row, col


def main():
    db = SessionLocal()
    try:
        # users --------------------------------------------------------------
        admin, _ = get_or_create(
            db, models.User, email="admin@railease.test",
            defaults=dict(name="RailEase Admin", password_hash=hash_password("admin12345"),
                          role=models.UserRole.ADMIN),
        )
        get_or_create(
            db, models.User, email="user@railease.test",
            defaults=dict(name="Demo Customer", password_hash=hash_password("user12345")),
        )

        # stations ---------------------------------------------------------------
        station_defs = [
            ("NDLS", "New Delhi", "New Delhi", "Delhi"),
            ("KOTA", "Kota Junction", "Kota", "Rajasthan"),
            ("BRC", "Vadodara Junction", "Vadodara", "Gujarat"),
            ("BCT", "Mumbai Central", "Mumbai", "Maharashtra"),
            ("SBC", "KSR Bengaluru", "Bengaluru", "Karnataka"),
            ("MAS", "MGR Chennai Central", "Chennai", "Tamil Nadu"),
        ]
        stations = {}
        for code, name, city, st in station_defs:
            obj, _ = get_or_create(
                db, models.Station, station_code=code,
                defaults=dict(name=name, city=city, state=st),
            )
            stations[code] = obj

        # train ----------------------------------------------------------------
        train, _ = get_or_create(
            db, models.Train, train_number="12951",
            defaults=dict(name="Mumbai Rajdhani Express", train_type="Rajdhani"),
        )

        # route + stops ------------------------------------------------------
        route, route_new = get_or_create(
            db, models.Route, train_id=train.id, name="New Delhi - Mumbai Central",
        )
        if route_new:
            legs = [
                ("NDLS", 1, None, time(16, 25), 0),
                ("KOTA", 2, time(21, 5), time(21, 10), 0),
                ("BRC", 3, time(2, 40), time(2, 45), 1),
                ("BCT", 4, time(8, 15), None, 1),
            ]
            for code, seq, arr, dep, day in legs:
                db.add(models.RouteStop(
                    route_id=route.id, station_id=stations[code].id, stop_sequence=seq,
                    arrival_time=arr, departure_time=dep, day_offset=day,
                ))
            db.flush()

        # coaches + seats -------------------------------------------------------
        # A realistic-ish rake: several coaches per class so the booking flow
        # has a coach-selection step (coach -> bay -> seat).
        AC3 = (models.CoachType.AC_THIRD, 64, Decimal("1800.00"))
        SL = (models.CoachType.SLEEPER, 72, Decimal("700.00"))
        CC = (models.CoachType.CHAIR_CAR, 78, Decimal("900.00"))
        coach_defs = [
            ("A1", *AC3), ("B1", *AC3), ("B2", *AC3), ("B3", *AC3), ("B4", *AC3),
            ("S1", *SL), ("S2", *SL), ("S3", *SL), ("S4", *SL),
            ("C1", *CC), ("C2", *CC),
        ]
        for number, ctype, cap, fare in coach_defs:
            coach, _ = get_or_create(
                db, models.Coach, train_id=train.id, coach_number=number,
                defaults=dict(coach_type=ctype, seat_capacity=cap, base_fare=fare),
            )
            if db.query(models.Seat).filter_by(coach_id=coach.id).count() == 0:
                for sn, stype, row, col in seat_rows_for_coach(ctype, cap):
                    db.add(models.Seat(
                        coach_id=coach.id, seat_number=f"{number}-{sn}", seat_type=stype,
                        row_number=row, column_number=col,
                    ))
                db.flush()

        # schedules (next 3 weekly departures) --------------------------------
        base_day = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
        for wk in range(3):
            jdate = base_day + timedelta(days=wk * 7)
            dep = datetime.combine(jdate, time(16, 25), tzinfo=timezone.utc)
            get_or_create(
                db, models.Schedule, train_id=train.id, route_id=route.id, journey_date=jdate,
                defaults=dict(departure_time=dep, arrival_time=dep + timedelta(hours=15, minutes=50)),
            )

        db.commit()

        # check ------------------------------------------------------------
        n_seats = db.query(models.Seat).join(models.Coach).filter(
            models.Coach.train_id == train.id).count()
        n_sched = db.query(models.Schedule).filter_by(train_id=train.id).count()
        n_coaches = db.query(models.Coach).filter_by(train_id=train.id).count()
        assert n_seats == sum(cap for _, _, cap, _ in coach_defs), n_seats
        assert n_sched == 3, n_sched
        print(f"OK — admin={admin.email} coaches={n_coaches} seats={n_seats} "
              f"schedules={n_sched} stations={db.query(models.Station).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
