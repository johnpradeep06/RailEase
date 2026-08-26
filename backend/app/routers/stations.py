from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_admin

router = APIRouter(prefix="/stations", tags=["stations"])


@router.get("", response_model=list[schemas.StationOut])
def list_stations(db: Session = Depends(get_db)):
    return db.query(models.Station).order_by(models.Station.name).all()


@router.get("/{station_id}", response_model=schemas.StationOut)
def get_station(station_id: UUID, db: Session = Depends(get_db)):
    station = db.get(models.Station, station_id)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return station


@router.post("", response_model=schemas.StationOut, status_code=status.HTTP_201_CREATED)
def create_station(
    payload: schemas.StationCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    if db.query(models.Station).filter(models.Station.station_code == payload.station_code).first():
        raise HTTPException(status_code=400, detail="Station code already exists")
    station = models.Station(**payload.model_dump())
    db.add(station)
    db.commit()
    db.refresh(station)
    return station
