# RailEase — backend analysis & frontend implementation notes

## Setup status (done)

| Step | State |
|---|---|
| Repo cloned | `D:\railease` (backend-only; no frontend yet) |
| Python venv | `backend/env/` (Python 3.12), `pip install -r requirements.txt` done |
| `backend/.env` | created — JWT secret generated; **`DATABASE_URL` is a placeholder** |
| Deployed backend | **live**: `https://fastapi-backend-production-6703.up.railway.app` — `/health` → `{"status":"ok"}`, migrations already applied |
| DB (Railway `Postgres`, project `enthusiastic-passion`) | schema migrated, **but empty** — `/stations` and `/trains` return `[]` |

### Running locally
The Railway Postgres has **no public endpoint**. Two options:

1. **Against the deployed backend (easiest for frontend dev):** point the frontend at
   `https://fastapi-backend-production-6703.up.railway.app`. No local Python needed.
2. **Local API server:** open a tunnel in a separate terminal, then paste its URL into
   `backend/.env` (`postgresql+psycopg2://...`):
   ```bash
   railway login && railway link      # enthusiastic-passion → production → Postgres
   railway connect Postgres --tunnel-only
   cd backend && env/Scripts/activate
   alembic upgrade head               # no-op, already at head
   uvicorn app.main:app --reload      # http://127.0.0.1:8000/docs
   ```

### Seeding
`backend/seed.py` (idempotent) creates: admin `admin@railease.test` / `admin12345`,
customer `user@railease.test` / `user12345`, 6 stations, train **12951** with a 4-stop route,
3 coaches — **A1 (3AC, 64)**, **S1 (SL, 72)**, **C1 (CC, 78)** — each with a full seat grid
(`row_number`/`column_number` set per the layout rules below), and 3 weekly schedules.

Needs DB access, so run it through the tunnel (Railway CLI not currently installed):
```bash
npm i -g @railway/cli && railway login && railway link   # → enthusiastic-passion / production / Postgres
railway connect Postgres --tunnel-only                    # leave running; copy the printed URL into backend/.env
cd backend && env/Scripts/python seed.py                  # prints "OK — admin=… seats=214 schedules=3"
```
Search after seeding: `source=NDLS destination=BCT journey_date=<next listed schedule date>`.

---

## Stack

FastAPI 0.141 · SQLAlchemy 2.0 · Alembic · PostgreSQL (native enums, UUID PKs) · Pydantic v2 ·
JWT (python-jose, HS256, 60 min, no refresh) · bcrypt.

All IDs are **UUID**. All money is `Numeric(10,2)` → serialized as **JSON strings** (`"450.00"`).
Enums serialize as their **value** (e.g. `"3AC"`, `"SIDE_LOWER"`), not the Python name.

---

## Data model

```
User ─< Booking ─< Passenger
                └─< BookingSeat >─ Seat >─ Coach >─ Train
                └─< Payment
                └─  Ticket (1:1)
Train ─< Coach ─< Seat
Train ─< Route ─< RouteStop >─ Station
Train ─< Schedule >─ Route
Schedule ─< Booking
User ─< Feedback
```

### Key tables

- **users** — `role` = `CUSTOMER|ADMIN`, `status` = `ACTIVE|SUSPENDED|INACTIVE`. Login blocked unless ACTIVE.
- **trains** — `train_number` (unique), `name`, `train_type`, `status` `ACTIVE|INACTIVE`.
- **stations** — `station_code` (unique, used by search), `name`, `city`, `state`.
- **routes / route_stops** — a route is an ordered stop list (`stop_sequence`, `arrival_time`,
  `departure_time`, `day_offset`). Unique on `(route_id, stop_sequence)` and `(route_id, station_id)`.
- **schedules** — a train running a route on `journey_date` with full `departure_time`/`arrival_time`
  timestamps. `status` = `SCHEDULED|CANCELLED|COMPLETED`; only `SCHEDULED` is bookable.
- **coaches** — belong to a train (not a schedule). `coach_number` (unique per train),
  `coach_type` = `1AC|2AC|3AC|SL|CC`, `seat_capacity`, `base_fare`.
- **seats** — belong to a coach. **This table is built for the seat map:**
  - `seat_number` — display label (`"S4-32"`, `"B1-12"`, …)
  - `seat_type` — `LOWER|MIDDLE|UPPER|SIDE_LOWER|SIDE_UPPER` (berth coaches) or `SEAT` (chair car)
  - `row_number`, `column_number` — **explicit grid coordinates** so the UI places seats directly
    without parsing `seat_number`. Unique on `(coach_id, row_number, column_number)`.
    - **SL / 1AC / 2AC / 3AC:** `row_number` = bay/compartment number, `column_number` = slot within
      the bay (mirrors the berth level — e.g. 1=LOWER, 2=MIDDLE, 3=UPPER, 4=SIDE_LOWER, 5=SIDE_UPPER).
    - **CC (chair car):** `row_number` = physical row, `column_number` = seat left→right in the row.
- **bookings** — `booking_reference` (unique), `user_id`, `schedule_id`, `source_station_id`,
  `destination_station_id`, `total_amount`, `status` = `PENDING|CONFIRMED|WAITLISTED|CANCELLED`.
- **passengers** — per booking: `name`, `date_of_birth`, `gender` `MALE|FEMALE|OTHER`,
  `berth_preference` `LOWER|MIDDLE|UPPER|SIDE_LOWER|SIDE_UPPER|NO_PREFERENCE`, `email`, `phone`.
- **booking_seats** — join of booking ⇄ seat ⇄ passenger, with `fare` and
  `status` = `RESERVED|CONFIRMED|CANCELLED`. Denormalizes `schedule_id` so a **partial unique index**
  `(schedule_id, seat_id) WHERE status IN ('RESERVED','CONFIRMED')` enforces "one seat per schedule"
  at the DB level. **A seat's availability is per-schedule, computed from this table** — the seat row
  itself has no status.
- **payments** — `payment_reference`, `amount`, `payment_method` = `UPI|CARD|NET_BANKING|WALLET`,
  `payment_status` = `PENDING|SUCCESS|FAILED|REFUNDED`. Gateway is **mocked** — always succeeds.
- **tickets** — 1:1 with booking, created on successful payment. `ticket_number`,
  `ticket_status` = `ACTIVE|CANCELLED`, `pdf_url` (always null — no PDF generation).
- **feedback** — `rating` 1–5, `subject`, `message`, `status` = `OPEN|IN_PROGRESS|RESOLVED|CLOSED`,
  `admin_response`.

---

## API contract (base = deployed URL above)

Auth: OAuth2 password bearer. Send `Authorization: Bearer <token>`.
Public (no token): `GET /trains*`, `GET /stations*`, `GET /routes/{id}`, `GET /schedules/search`,
`GET /schedules/{id}`, `GET /schedules/{id}/seats`, `GET /coaches/{id}/seats`, `GET /health`.
Admin-only (403 otherwise): all `POST /trains|/stations|/routes|/schedules|/coaches`,
`POST /coaches/{id}/seats`, `PUT /feedback/{id}/respond`.

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | JSON `{name, email, phone?, password(8–72), date_of_birth?}` | `UserOut` |
| POST | `/auth/login` | **form-urlencoded** `username`(=email), `password` | `{access_token, token_type}` |
| GET | `/auth/me` | — | `UserOut` |

### Catalogue
| Method | Path | Notes |
|---|---|---|
| GET | `/trains` | all trains |
| GET | `/trains/{id}` · `/trains/{id}/coaches` | |
| GET | `/stations` | all stations (load once, filter client-side for autocomplete) |
| GET | `/stations/{id}` | |
| GET | `/routes/{id}` | route + ordered `stops[]` with nested `station` |
| GET | `/coaches/{id}/seats` | raw seat list for a coach (no status) |

### Search & schedule
- `GET /schedules/search?source={CODE}&destination={CODE}&journey_date={YYYY-MM-DD}`
  → `ScheduleSearchResult[]`:
  ```
  { id, train: TrainOut, journey_date, departure_time, arrival_time, status,
    coach_availability: [ { coach_type, base_fare, total_seats, available_seats } ] }
  ```
  Search is by station **code**. `coach_availability` is one entry **per coach** (coaches of the
  same type appear multiple times — group by `coach_type` in the UI if you want a single row).
- `GET /schedules/{id}` → `ScheduleDetailOut` = `ScheduleOut` + `train` + `route` (with `stops[]`).
  Use `route.stops` to build the source/destination pickers — backend rejects a booking whose
  source/destination aren't both on the route or whose source isn't before the destination.

### Seat map  ← the feature
`GET /schedules/{schedule_id}/seats?coach_type={SL|CC|1AC|2AC|3AC}` (coach_type optional)
→ `CoachSeatMap[]`:
```jsonc
{
  "coach_id": "uuid",
  "coach_number": "S4",
  "coach_type": "SL",
  "base_fare": "450.00",
  "seats": [
    { "id": "uuid", "seat_number": "S4-1", "seat_type": "LOWER",
      "row_number": 1, "column_number": 1, "status": "AVAILABLE" },   // or "TAKEN"
    ...
  ]
}
```
`status` = `TAKEN` iff a `booking_seat` for this schedule references the seat with status
`RESERVED` or `CONFIRMED`; else `AVAILABLE`. Seats come sorted by `(row_number, column_number)`.

### Booking / payment / ticket
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/bookings` | `{schedule_id, source_station_id, destination_station_id, seat_ids:[uuid](1–6), passengers:[PassengerCreate](1–6)}` | `BookingOut` (status `PENDING`) |
| GET | `/bookings/me` | — | `BookingOut[]` (newest first) |
| GET | `/bookings/{id}` | — | `BookingOut` |
| DELETE | `/bookings/{id}` | — | `BookingOut` (status `CANCELLED`, seats released) |
| POST | `/bookings/{id}/pay` | `{payment_method}` | `PaymentOut` (auto-`SUCCESS`, issues ticket, booking → `CONFIRMED`) |
| GET | `/tickets/{booking_id}` | — | `TicketOut` |

`seat_ids` and `passengers` are paired **by index** (`seat_ids[i]` ↔ `passengers[i]`); must be equal
length, no duplicate `seat_ids`. `fare` per seat = the coach's `base_fare` (no distance-based pricing).
`BookingOut.booking_seats[]` = `{ id, seat: SeatOut, passenger_id, fare, status }`.

### Feedback
| Method | Path | Body |
|---|---|---|
| POST | `/feedback` | `{booking_id?, rating(1–5), subject?, message}` |
| GET | `/feedback/me` | — |
| PUT | `/feedback/{id}/respond` | admin: `{admin_response, status?}` |

---

## Seat-selection feature — frontend design

### Flow
1. **Search** (`/schedules/search`) → results list with per-type availability + fare.
2. Pick a schedule → **schedule detail** (`/schedules/{id}`) for train/route/stops; user confirms
   boarding + destination station (from `route.stops`).
3. Pick a class → **seat map** (`/schedules/{id}/seats?coach_type=…`).
4. User selects up to 6 seats (theatre-style). Track selected `seat_id`s client-side.
5. **Passenger form** — one row per selected seat (name, dob, gender, berth_preference, email, phone),
   showing which seat each maps to.
6. `POST /bookings` → PENDING booking. On `400 "Seat(s) no longer available…"`: toast the message,
   **refetch the seat map, clear selection, stay on step 3**.
7. **Payment** screen → `POST /bookings/{id}/pay` (method picker) → success → **ticket** view
   (`/tickets/{booking_id}`), plus link to it from `/bookings/me`.

### Rendering the map
- One coach at a time; a coach selector (chips) from the `CoachSeatMap[]` for the chosen type.
- Derive `maxRow = max(row_number)`, `maxCol = max(column_number)` from `seats`. Render a CSS grid
  `maxRow × maxCol`; place each seat at its `(row_number, column_number)`. Missing cells = empty.
- **CC:** insert an aisle gutter column (e.g. after `column_number === 3` for a 3+3 layout — confirm
  against real seed data). Label seats by `seat_number`.
- **SL / 3AC / 2AC / 1AC:** render each `row_number` as a **bay** card; inside it place berths by
  `column_number`; main berths (LOWER/MIDDLE/UPPER) as a stacked triple, side berths
  (SIDE_LOWER/SIDE_UPPER) as a separate stacked pair across the aisle. Badge each with L/M/U/SL/SU.
- **States:** `AVAILABLE` (clickable), `TAKEN` (disabled, greyed), `SELECTED` (highlight).
  Enforce the 6-seat cap. Legend + running total (`base_fare × count`).
- Keyboard/focus support on seat buttons; `aria-pressed` for selection; `aria-disabled` for taken.
- No realtime feed — refetch the map on mount and after any booking `400`.

### Gaps to plan around
- **No seat hold / TTL.** A `PENDING` booking holds its seats until paid or cancelled (no expiry job).
  Consider cancelling the booking if the user abandons the payment step.
- **No PDF** (`pdf_url` always null) — render the ticket in-app.
- **No admin list endpoints** for bookings/users/schedules — an admin area can only *create*
  (trains, stations, routes, schedules, coaches, seats) and respond to feedback fetched by id.
- **CORS:** set `FRONTEND_ORIGINS` on the `fastapi-backend` Railway service to include the frontend's
  dev + prod origins (currently unknown).
- **Deploy source:** per `backend/README.md`, the service is deployed by CLI upload, not a connected
  GitHub repo — pushes don't auto-deploy yet.
