# IRCTC Backend

FastAPI + SQLAlchemy + Alembic backend for a train ticket booking system, backed by PostgreSQL on Railway.

## Tech stack

- **FastAPI** 0.141 — API framework
- **SQLAlchemy** 2.0 (classic `Column`/`relationship` style) — ORM
- **Alembic** — migrations
- **PostgreSQL** (Railway-hosted) — database, native enum types, UUID primary keys
- **Pydantic v2** — request/response schemas
- **python-jose** + **bcrypt** — JWT auth, password hashing
- **psycopg2-binary** — Postgres driver

## Project structure

```
app/
  main.py            FastAPI app, CORS, router registration
  config.py           Settings (reads from environment / .env)
  database.py          SQLAlchemy engine, session, declarative Base
  security.py           Password hashing (bcrypt) + JWT create/decode
  deps.py                 get_current_user / get_current_admin dependencies
  models.py                 All 14 SQLAlchemy models + enums
  schemas.py                 All Pydantic request/response schemas
  routers/                    One router per resource (auth, trains, stations,
                               routes, schedules, coaches, bookings, payments,
                               tickets, feedback)
  services/
    booking_service.py         Seat locking (SKIP LOCKED), booking creation,
                                cancellation, ticket issuance

alembic/
  env.py               Reads DATABASE_URL from app.config; imports app.models
                        so autogenerate sees the full schema
  versions/             Migration history
```

## Prerequisites

- Python 3.11+
- A PostgreSQL database (this project targets the `Postgres` service already
  provisioned in the `enthusiastic-passion` Railway project)
- [Railway CLI](https://docs.railway.com/guides/cli) if you need to connect to
  that Postgres instance from your local machine (it has no public endpoint —
  see below)

## Local setup

1. **Create a virtualenv and install dependencies**

   ```bash
   python -m venv env
   # Windows:
   env\Scripts\activate
   # macOS/Linux:
   source env/bin/activate

   pip install -r requirements.txt
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in real values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |---|---|
   | `DATABASE_URL` | Postgres connection string. See "Connecting to the database" below. |
   | `JWT_SECRET_KEY` | Random secret used to sign JWTs. Generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Never reuse the placeholder in `.env.example`. |
   | `JWT_ALGORITHM` | Defaults to `HS256`. |
   | `JWT_EXPIRE_MINUTES` | Access token lifetime in minutes. Defaults to `60`. |
   | `FRONTEND_ORIGINS` | Comma-separated list of allowed CORS origins (e.g. `http://localhost:3000,http://localhost:5173`). |

3. **Connecting to the database**

   The Railway `Postgres` service has **no public network access enabled** —
   only services inside the same Railway project can reach it directly. To
   connect from your own machine (for local dev or running migrations
   outside of Railway), open a private tunnel with the Railway CLI instead of
   enabling public access:

   ```bash
   npm install -g @railway/cli   # if not already installed
   railway login
   railway link                  # select workspace → enthusiastic-passion → production → Postgres
   railway connect Postgres --tunnel-only
   ```

   This prints a local `Host`/`Port`/`User`/`Password`/`URL` — put that URL
   (with the `postgresql+psycopg2://` prefix) into `DATABASE_URL` in your
   `.env`. Leave the tunnel command running in its own terminal while you
   work; closing it just breaks local DB access, it has no effect on the
   deployed service (which connects over Railway's internal network, not
   this tunnel).

4. **Run migrations**

   ```bash
   alembic upgrade head
   ```

5. **Run the dev server**

   ```bash
   uvicorn app.main:app --reload
   ```

   Then open **http://127.0.0.1:8000/docs** for interactive Swagger UI —
   the fastest way to try endpoints and inspect request/response shapes.

## Creating an admin user

There is no public "become admin" endpoint by design. Register a normal
account via `POST /auth/register`, then promote it directly in the database:

```bash
python -c "
from app.database import SessionLocal
from app import models
db = SessionLocal()
u = db.query(models.User).filter(models.User.email == 'you@example.com').first()
u.role = models.UserRole.ADMIN
db.commit()
"
```

## Database schema changes

After editing `app/models.py`, generate and review a migration before
applying it:

```bash
alembic revision --autogenerate -m "describe the change"
# review the generated file in alembic/versions/
alembic upgrade head
```

## Deployment (Railway)

The `fastapi-backend` service lives in the same Railway project as
`Postgres` (`enthusiastic-passion`). Configuration already set on the
service:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}` — resolved via Railway's
  internal private network, never leaves the project
- Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  — migrations run automatically on every deploy
- Healthcheck: `GET /health`

Currently deployed via direct CLI upload (`railway up`), not a connected
GitHub repo. Once this is pushed to GitHub, switch the service's source to
the repo in the Railway dashboard (or via `railway service` /
`create-deployment`) to get deploys on every push instead.

## Testing the seat-locking guarantee

The most important thing to verify after any change to
`services/booking_service.py`: two concurrent `POST /bookings` requests for
the *same seat* on the *same schedule* must resolve to exactly one success
and one `400 "Seat(s) no longer available"` — never two successes. Fire two
requests at once (e.g. two backgrounded `curl` calls) against a schedule
with only one free seat left and confirm the split.
