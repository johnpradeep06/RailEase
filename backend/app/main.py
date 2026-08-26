from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
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

app = FastAPI(title="IRCTC Backend")

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
app.include_router(tickets.router)
app.include_router(feedback.router)


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
