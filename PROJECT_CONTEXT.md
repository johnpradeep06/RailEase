# RailEase — Project Context

A full-stack train ticket booking platform (IRCTC-style) with a FastAPI backend and a React
frontend, built around a realistic **theatre-style seat map** (coach → bay/compartment → seat).

- **Repo:** https://github.com/johnpradeep06/RailEase
- **Frontend (live):** https://railease-six.vercel.app
- **Backend (live):** https://fastapi-backend-production-6703.up.railway.app (docs at `/docs`)
- **Hosting:** Railway (FastAPI + Postgres), Vercel (frontend, auto-deploys on push to `main`)

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Backend framework | FastAPI 0.141, Uvicorn |
| ORM / migrations | SQLAlchemy 2.0 (classic style), Alembic |
| Database | PostgreSQL (Railway-hosted), native enum types, UUID primary keys |
| Validation | Pydantic v2 |
| Auth | JWT (python-jose, HS256) + bcrypt password hashing |
| DB driver | psycopg2-binary |
| Frontend framework | React 19 + TypeScript, Vite 8 |
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Frontend hosting | Vercel (static build + `/api/*` rewrite proxy to Railway) |

---

## 2. Repository layout

```
railease/
  backend/
    app/
      main.py            FastAPI app, CORS, router registration
      config.py           Settings (env vars)
      database.py          SQLAlchemy engine/session
      security.py            Password hashing + JWT
      deps.py                  get_current_user / get_current_admin
      models.py                 14 SQLAlchemy models + enums
      schemas.py                 Pydantic request/response schemas
      routers/                    auth, trains, stations, routes, schedules,
                                   coaches, bookings, payments, tickets, feedback
      services/
        booking_service.py         Seat locking, booking/ticket lifecycle
    alembic/                       Migration history
    seed.py                        Idempotent dev-data seed script
    requirements.txt
    README.md
  frontend/
    src/
      lib/            api.ts (typed client), types.ts, format.ts,
                       personalization.ts, seatgen.ts
      auth/            AuthContext.tsx (login/session)
      booking/         BookingContext.tsx (multi-step wizard state)
      components/      Layout, SeatMap, SlotCard, TicketCard, Stepper,
                        ImagePlaceholder, ui.tsx
      pages/           Home, Login, Search, Results, SeatSelect, Passengers,
                        Payment, Confirmation, MyTrips, TripDetail, Feedback,
                        Account, admin/*
    vercel.json                    /api/* rewrite -> Railway backend
    README.md
  FRONTEND_NOTES.md                Original backend/API analysis
  PROJECT_CONTEXT.md               This file
```

---

## 3. Database schema (14 tables)

```
User ──< Booking ──< Passenger
                 ├──< BookingSeat >── Seat >── Coach >── Train
                 ├──< Payment
                 └──  Ticket (1:1)
Train ──< Coach ──< Seat
Train ──< Route ──< RouteStop >── Station
Train ──< Schedule >── Route
Schedule ──< Booking
User ──< Feedback
```

| Table | Purpose | Notable fields |
|---|---|---|
| `users` | accounts | `role` (CUSTOMER/ADMIN), `status` (ACTIVE/SUSPENDED/INACTIVE) |
| `trains` | train catalogue | `train_number` (unique), `status` |
| `stations` | station catalogue | `station_code` (unique) |
| `routes` / `route_stops` | ordered stop list per train | `stop_sequence`, `arrival/departure_time`, `day_offset` |
| `schedules` | a train running a route on one date | `journey_date`, full timestamps, `status` |
| `coaches` | belongs to a train | `coach_type` (1AC/2AC/3AC/SL/CC), `seat_capacity`, `base_fare` |
| `seats` | belongs to a coach | `seat_type`, **`row_number`/`column_number`** — explicit grid coords driving the seat map |
| `bookings` | one purchase | `booking_reference`, `total_amount`, `status` (PENDING/CONFIRMED/WAITLISTED/CANCELLED) |
| `passengers` | per booking | `gender`, `berth_preference` |
| `booking_seats` | join: booking ⇄ seat ⇄ passenger | partial **unique index** `(schedule_id, seat_id)` where status is RESERVED/CONFIRMED — DB-level double-booking guard |
| `payments` | mock gateway record | `payment_method`, `payment_status` |
| `tickets` | issued on payment success | `ticket_number`, `ticket_status` |
| `feedback` | rating + message | `status`, `admin_response` |

**Seat grid convention** (why the seat map works):
- **Berth coaches (SL/1AC/2AC/3AC):** `row_number` = bay number, `column_number` = slot within an 8-seat bay (1-3 & 4-6 = LOWER/MIDDLE/UPPER on each side, 7-8 = SIDE_LOWER/SIDE_UPPER).
- **Chair car (CC):** `row_number` = physical row, `column_number` = seat left→right (1-6, labelled A-F).

---

## 4. Backend API (28 endpoints)

Auth: OAuth2 password bearer (`Authorization: Bearer <token>`).

| Area | Endpoints | Auth |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` (form-encoded), `GET /auth/me` | public / self |
| Catalogue | `GET/POST /trains`, `GET /trains/{id}`, `GET /trains/{id}/coaches`, `GET/POST /stations`, `GET /stations/{id}` | GET public, POST admin |
| Routes | `POST /routes`, `GET /routes/{id}` | POST admin |
| Coaches/Seats | `POST /coaches`, `GET/POST /coaches/{id}/seats` | POST admin |
| Search / schedule | `GET /schedules/search`, `POST /schedules`, `GET /schedules/{id}`, `GET /schedules/{id}/seats` | GET public, POST admin |
| Booking | `POST /bookings`, `GET /bookings/me`, `GET/DELETE /bookings/{id}` | auth (admin can act on any) |
| Payment | `POST /bookings/{id}/pay` | auth |
| Ticket | `GET /tickets/{booking_id}` | auth |
| Feedback | `POST /feedback`, `GET /feedback/me`, `PUT /feedback/{id}/respond` | auth, respond = admin |

**Concurrency-safe booking:** `reserve_specific_seats` uses `SELECT ... FOR UPDATE SKIP LOCKED` plus the DB partial unique index above — two simultaneous bookings for the same seat resolve to exactly one success and one `400 "Seat(s) no longer available"`.

**Chair-car berth guard:** `booking_service.create_booking` forces `berth_preference = NO_PREFERENCE` for any `SEAT`-type seat, regardless of client input.

**Deliberate API gaps** (confirmed while building the admin panel — not oversights, just what exists):
- No update/delete for trains, stations, routes, coaches, or seats (create + read only).
- No "list all" for bookings, feedback, or users — lookup is by ID only (admin can fetch/cancel *any* booking by ID; respond to *any* feedback by ID).
- No user-management endpoints at all.
- No seat-hold TTL — a `PENDING` booking reserves its seats until paid or explicitly cancelled.
- Payment gateway is mocked (`POST /bookings/{id}/pay` always succeeds synchronously).
- No PDF generation (`ticket.pdf_url` is always null).

---

## 5. Frontend — implemented features

### Auth & session
- Login / register, JWT stored in `localStorage`.
- Any `401` clears the token, fires a `railease:session-expired` event, and redirects to `/login` with a "session expired" notice and a return-to path.

### Personalization
- **Home** dashboard: greeting by name + time of day, an inline hero search widget, **recent searches** (persisted client-side), a "next upcoming trip" card, and "Explore routes" cards with real destination photos.
- **Account** page: profile summary from `/auth/me`, confirmed-trip count, sign-out, admin-panel link (if admin).

### Booking flow (6 steps)
1. **Search** — station pickers (with swap control) + journey date.
2. **Results** — trains for the route/date with per-class fares and live availability.
3. **Seats** — **3-level drill-down**: pick a **coach** → pick a **bay/compartment** (with a live availability bar) → pick a **seat** on the real berth/row layout. Selection can span multiple coaches; each seat carries its own coach + fare.
4. **Passengers** — one form per seat. No manual berth dropdown (removed as redundant); instead each card shows a **visual confirmation** of the coach/seat/berth already chosen on the map.
5. **Payment** — mock gateway, method picker, success modal.
6. **Confirmation / Ticket** — PNR-style ticket view, reused on the trip-detail page.

### My Trips
- List with filters (All / Upcoming / Past / Cancelled), view detail, cancel.

### Feedback
- Submit rating + message (optionally tied to a booking), view own feedback + admin responses.

### Admin panel (`/admin`, role-gated to `ADMIN`)
Landing page is a **capability matrix** stating plainly what the API supports:

| Feature | Status |
|---|---|
| Admin login | ✅ same login, role read from `/auth/me` |
| Create train | ✅ |
| Update/delete train | ❌ not in API |
| Manage stations | ⚠️ create + list only |
| Manage routes & stops | ⚠️ create (dynamic stop builder) + view-by-id |
| Manage coaches & seats | ⚠️ create coach, list per train, **bulk-generate a realistic seat grid** from type + capacity |
| Create schedule | ✅ |
| View/manage bookings | ⚠️ look up + cancel by ID (no browse-all) |
| Manage users | ❌ not in API |
| Manage feedback | ⚠️ respond by ID (no browse-all) |

### Design system
- Warm off-white background, near-black ink, **lime accent `#c9f24d`**, Space Grotesk (display) + Inter (body), squircle cards, soft layered shadows.
- **Responsive:** desktop gets a top nav + avatar menu; mobile/tablet gets a **floating glassmorphism bottom dock** (frosted blur, rounded pill) plus, on the seat-selection page, a floating action card above the dock showing seat count/total and a clearly-visible (never faded) call-to-action button.
- `ImagePlaceholder` component marks every spot meant for a real photo (`data-image-placeholder` attribute) — most have since been replaced with supplied images (hero, login, destination cards).
- Mobile seat grid: the level-3 seat visualization scrolls **inside its card** rather than breaking page layout; chair-car seats shrink slightly on narrow screens.

---

## 6. Seed data (`backend/seed.py`, idempotent)

| | |
|---|---|
| Admin | `admin@railease.test` / `admin12345` |
| Customer | `user@railease.test` / `user12345` |
| Stations | NDLS, KOTA, BRC, BCT, PUNE, SBC, MAS (7) |
| Trains | 12951 Mumbai Rajdhani (NDLS→KOTA→BRC→BCT) · 12952 Mumbai Rajdhani return · 12163 Chennai Express (BCT→PUNE→MAS) · 12007 Chennai Shatabdi (MAS→SBC) · 12008 Bengaluru Shatabdi (SBC→MAS) |
| Coaches | per train: 3AC / SL / CC mixes (e.g. 12951 = 5×3AC, 4×SL, 2×CC = 764 seats) — 2,432 seats total |
| Schedules | a **daily departure for the next 30 days** for every train (IST times; re-run `seed.py` to roll the window forward) |

Re-running the script is safe — every row is looked up by natural key before insert.

---

## 7. Environment & configuration

**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql+psycopg2://...       # Railway Postgres (public proxy for local dev)
JWT_SECRET_KEY=...
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
FRONTEND_ORIGINS=http://localhost:3000,http://localhost:5173
```
Railway's Postgres has no permanent public endpoint — "Add Public Access" was used temporarily to seed data via the local script, then can be turned back off; the deployed backend always talks to it over Railway's internal network regardless.

**Frontend**: no `.env` required. `frontend/vercel.json` rewrites `/api/*` to the Railway backend URL in production; `vite.config.ts` proxies the same path in dev (default target is the deployed backend, overridable with `VITE_API_TARGET`).

---

## 8. Running locally

**Backend**
```bash
cd backend
env\Scripts\activate          # venv already created
uvicorn app.main:app --reload # http://127.0.0.1:8000/docs
```

**Frontend**
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

---

## 9. Deployment

- **Backend:** Railway service `fastapi-backend` in project `enthusiastic-passion`, connected to GitHub — start command `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, healthcheck `GET /health`.
- **Frontend:** Vercel project `railease` (team *johnpradeep06's projects*), linked to this GitHub repo with **Root Directory = `frontend`**, production branch `main` — every push auto-deploys. Live domain `railease-six.vercel.app` (`railease.vercel.app` was already taken).

---

## 9b. Payments & seat locking (added later)

- **Razorpay (test mode)** replaces the mock gateway when `RAZORPAY_KEY_ID/SECRET` are set: order → Checkout → server-side HMAC + gateway verification → atomic confirmation. Cancelled / failed / interrupted / late payments are all handled (webhook + reconcile endpoint + automatic refund when a late payment can't be honoured).
- **Seat lock with expiry:** a pending booking holds its seats for `SEAT_LOCK_MINUTES` (default 10); released on cancel/failure immediately and on expiry automatically (lazy check + 30 s sweeper). New `EXPIRED` booking status; payment page has a live countdown.
- **Concurrency:** ordered row locks + fresh re-check + the partial unique index, with lost races returned as HTTP 409 (a load test found the old code leaking 500s).
- Frontend: live seat updates (polling), selection reconciliation, resume-payment from My Trips.
- Full write-up, diagrams and a faculty demo script: `docs/PAYMENTS_AND_SEAT_LOCKING.md`. Checks: `backend/race_demo.py`, `backend/payment_flow_check.py`.

## 10. Known limitations / not implemented

- No CRUD update/delete for the catalogue (trains, stations, routes, coaches, seats) — the backend API doesn't expose it.
- No user administration (suspend/promote/list users) — no such endpoints exist.
- No way to browse all bookings or all feedback — only single-record lookup by ID.
- Razorpay runs in test mode only; refunding a *confirmed* ticket on user cancellation is not automated.
- No PDF ticket export.
- A couple of user-supplied images are large (multi-MB) and inflate the bundle — worth compressing.

---

## 11. Requirements recap (what was asked for, and where it landed)

| Requirement | Delivered |
|---|---|
| Clone & analyse existing backend | ✅ `FRONTEND_NOTES.md` |
| Full booking frontend | ✅ search → results → seats → passengers → payment → ticket |
| Theatre-style seat selection | ✅ 3-level coach → bay → seat drill-down, realistic berth/row layouts |
| Modern, responsive UI (desktop + mobile) | ✅ incl. floating glass mobile nav, responsive seat grid |
| Personalization / session handling | ✅ greeting, recent searches, next-trip, 401 → re-auth flow |
| Admin panel matching a 10-feature spec | ✅ implemented everything the API supports; gaps documented in-app |
| Realistic train/coach/seat data | ✅ 11-coach rake, 764 seats, per-class realistic bay/row sizes |
| Version control & CI | ✅ pushed to GitHub, Vercel auto-deploy on `main` |
| Public deployment | ✅ frontend on Vercel, backend on Railway |
