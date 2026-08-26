from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("", response_model=schemas.RouteOut, status_code=status.HTTP_201_CREATED)
def create_route(
    payload: schemas.RouteCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    train = db.get(models.Train, payload.train_id)
    if train is None:
        raise HTTPException(status_code=404, detail="Train not found")

    sequences = [stop.stop_sequence for stop in payload.stops]
    if len(sequences) != len(set(sequences)):
        raise HTTPException(status_code=400, detail="Duplicate stop_sequence values")

    route = models.Route(train_id=payload.train_id, name=payload.name, status=payload.status)
    db.add(route)
    db.flush()

    for stop_in in payload.stops:
        db.add(models.RouteStop(route_id=route.id, **stop_in.model_dump()))

    db.commit()
    db.refresh(route)
    return route


@router.get("/{route_id}", response_model=schemas.RouteOut)
def get_route(route_id: UUID, db: Session = Depends(get_db)):
    route = (
        db.query(models.Route)
        .options(joinedload(models.Route.stops).joinedload(models.RouteStop.station))
        .filter(models.Route.id == route_id)
        .first()
    )
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    return route
