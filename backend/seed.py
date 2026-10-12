"""Idempotent demo seed: users, stations, five trains with routes, coaches + seat
grids, and a daily schedule for every train for the next 30 days.

    cd backend && env/Scripts/python seed.py          # uses DATABASE_URL from .env

Safe to run repeatedly — every row is looked up by its natural key first, so
re-running just rolls the schedule window forward (run it again whenever the
seeded dates start running out).

Times are stored with the India offset (+05:30) so a 16:25 timetable entry shows
as 16:25 to Indian users.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from app.database import SessionLocal
from app import models
from app.security import hash_password

IST = timezone(timedelta(hours=5, minutes=30))
DAYS_AHEAD = 30

CT = models.CoachType
AC3 = (CT.AC_THIRD, 64)
SL = (CT.SLEEPER, 72)
CC = (CT.CHAIR_CAR, 78)

STATIONS = [
    ("NDLS", "New Delhi", "New Delhi", "Delhi"),
    ("KOTA", "Kota Junction", "Kota", "Rajasthan"),
    ("BRC", "Vadodara Junction", "Vadodara", "Gujarat"),
    ("BCT", "Mumbai Central", "Mumbai", "Maharashtra"),
    ("PUNE", "Pune Junction", "Pune", "Maharashtra"),
    ("SBC", "KSR Bengaluru", "Bengaluru", "Karnataka"),
    ("MAS", "MGR Chennai Central", "Chennai", "Tamil Nadu"),
]

# stop = (station_code, arrival, departure, day_offset)
TRAINS = [
    dict(
        number="12951", name="Mumbai Rajdhani Express", type="Rajdhani",
        route="New Delhi - Mumbai Central",
        stops=[("NDLS", None, time(16, 25), 0), ("KOTA", time(21, 5), time(21, 10), 0),
               ("BRC", time(2, 40), time(2, 45), 1), ("BCT", time(8, 15), None, 1)],
        # coach number -> (type, capacity), fare
        coaches=[(n, AC3, "1800") for n in ("A1", "B1", "B2", "B3", "B4")]
        + [(n, SL, "700") for n in ("S1", "S2", "S3", "S4")]
        + [(n, CC, "900") for n in ("C1", "C2")],
    ),
    dict(
        number="12952", name="Mumbai Rajdhani Express (Return)", type="Rajdhani",
        route="Mumbai Central - New Delhi",
        stops=[("BCT", None, time(17, 5), 0), ("BRC", time(22, 20), time(22, 25), 0),
               ("KOTA", time(4, 50), time(4, 55), 1), ("NDLS", time(8, 30), None, 1)],
        coaches=[(n, AC3, "1800") for n in ("A1", "B1", "B2", "B3")]
        + [(n, SL, "700") for n in ("S1", "S2", "S3")]
        + [(n, CC, "900") for n in ("C1", "C2")],
    ),
    dict(
        number="12163", name="Chennai Express", type="Superfast",
        route="Mumbai Central - Pune - Chennai Central",
        stops=[("BCT", None, time(22, 0), 0), ("PUNE", time(1, 30), time(1, 35), 1),
               ("MAS", time(21, 40), None, 1)],
        coaches=[(n, AC3, "1650") for n in ("B1", "B2")]
        + [(n, SL, "650") for n in ("S1", "S2", "S3", "S4")],
    ),
    dict(
        number="12007", name="Chennai Shatabdi", type="Shatabdi",
        route="Chennai Central - Bengaluru",
        stops=[("MAS", None, time(6, 0), 0), ("SBC", time(10, 50), None, 0)],
        coaches=[(n, CC, "1100") for n in ("C1", "C2", "C3", "C4")],
    ),
    dict(
        number="12008", name="Bengaluru Shatabdi", type="Shatabdi",
        route="Bengaluru - Chennai Central",
        stops=[("SBC", None, time(14, 30), 0), ("MAS", time(19, 30), None, 0)],
        coaches=[(n, CC, "1100") for n in ("C1", "C2", "C3", "C4")],
    ),
]

# --- seat grid templates -------------------------------------------------------
# column -> berth level, mirroring Seat.column_number semantics in models.py
BAY = {
    1: models.SeatType.LOWER, 2: models.SeatType.MIDDLE, 3: models.SeatType.UPPER,
    4: models.SeatType.LOWER, 5: models.SeatType.MIDDLE, 6: models.SeatType.UPPER,
    7: models.SeatType.SIDE_LOWER, 8: models.SeatType.SIDE_UPPER,
}


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
    if coach_type == CT.CHAIR_CAR:
        for i in range(capacity):
            row, col = i // 6 + 1, i % 6 + 1
            yield f"{row}{'ABCDEF'[col - 1]}", models.SeatType.SEAT, row, col
    else:
        for i in range(capacity):
            row, col = i // 8 + 1, i % 8 + 1
            yield f"{i + 1}", BAY[col], row, col


def seed_train(db, cfg, stations):
    train, _ = get_or_create(
        db, models.Train, train_number=cfg["number"],
        defaults=dict(name=cfg["name"], train_type=cfg["type"]),
    )
    route, new = get_or_create(db, models.Route, train_id=train.id, name=cfg["route"])
    if new:
        for seq, (code, arr, dep, day) in enumerate(cfg["stops"], start=1):
            db.add(models.RouteStop(
                route_id=route.id, station_id=stations[code].id, stop_sequence=seq,
                arrival_time=arr, departure_time=dep, day_offset=day,
            ))
        db.flush()

    capacity = 0
    for number, (ctype, cap), fare in cfg["coaches"]:
        coach, _ = get_or_create(
            db, models.Coach, train_id=train.id, coach_number=number,
            defaults=dict(coach_type=ctype, seat_capacity=cap, base_fare=Decimal(fare)),
        )
        capacity += cap
        if db.query(models.Seat).filter_by(coach_id=coach.id).count() == 0:
            for sn, stype, row, col in seat_rows_for_coach(ctype, cap):
                db.add(models.Seat(
                    coach_id=coach.id, seat_number=f"{number}-{sn}", seat_type=stype,
                    row_number=row, column_number=col,
                ))
            db.flush()

    first, last = cfg["stops"][0], cfg["stops"][-1]
    for offset in range(1, DAYS_AHEAD + 1):
        jdate = date.today() + timedelta(days=offset)
        dep = datetime.combine(jdate, first[2], tzinfo=IST)
        arr = datetime.combine(jdate + timedelta(days=last[3]), last[1], tzinfo=IST)
        get_or_create(
            db, models.Schedule, train_id=train.id, route_id=route.id, journey_date=jdate,
            defaults=dict(departure_time=dep, arrival_time=arr),
        )
    return train, capacity


def main():
    db = SessionLocal()
    try:
        admin, _ = get_or_create(
            db, models.User, email="admin@railease.test",
            defaults=dict(name="RailEase Admin", password_hash=hash_password("admin12345"),
                          role=models.UserRole.ADMIN),
        )
        get_or_create(
            db, models.User, email="user@railease.test",
            defaults=dict(name="Demo Customer", password_hash=hash_password("user12345")),
        )
        stations = {}
        for code, name, city, state in STATIONS:
            stations[code], _ = get_or_create(
                db, models.Station, station_code=code,
                defaults=dict(name=name, city=city, state=state),
            )

        report = []
        for cfg in TRAINS:
            train, capacity = seed_train(db, cfg, stations)
            n_seats = db.query(models.Seat).join(models.Coach).filter(
                models.Coach.train_id == train.id).count()
            n_future = db.query(models.Schedule).filter(
                models.Schedule.train_id == train.id,
                models.Schedule.journey_date >= date.today()).count()
            assert n_seats == capacity, (cfg["number"], n_seats, capacity)
            assert n_future >= DAYS_AHEAD, (cfg["number"], n_future)
            report.append(f"{cfg['number']} {cfg['name']}: {n_seats} seats, {n_future} upcoming")

        db.commit()
        print(f"OK — admin={admin.email}, {len(TRAINS)} trains, {len(stations)} stations")
        print("\n".join("  " + line for line in report))
    finally:
        db.close()


if __name__ == "__main__":
    main()
