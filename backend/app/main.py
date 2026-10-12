import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import SessionLocal
from .routers import (
    auth,
    bookings,
    coaches,
    feedback,
    payments,
    routes,
    schedules,
    stations,
    tickets,
    trains,
)
from .services import booking_service

log = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 30


def _sweep_once() -> None:
    with SessionLocal() as db:
        released = booking_service.expire_stale_holds(db)
        if released:
            log.info("released %d expired seat lock(s)", released)


async def _sweeper() -> None:
    """Free the seats of unpaid bookings once their lock deadline passes.

    Every availability read/write also expires stale holds lazily, so this task
    only keeps the stored state tidy while nobody is calling the API.
    """
    while True:
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
        try:
            await asyncio.to_thread(_sweep_once)
        except Exception:
            log.exception("seat-lock sweeper failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_sweeper())
    yield
    task.cancel()


app = FastAPI(title="IRCTC Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(trains.router)
app.include_router(stations.router)
app.include_router(routes.router)
app.include_router(schedules.router)
app.include_router(coaches.router)
app.include_router(bookings.router)
app.include_router(payments.router)
app.include_router(payments.gateway_router)
app.include_router(tickets.router)
app.include_router(feedback.router)


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
