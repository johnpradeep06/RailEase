from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import (
    ActiveInactiveStatus,
    BerthPreference,
    BookingSeatStatus,
    BookingStatus,
    CoachType,
    FeedbackStatus,
    Gender,
    PaymentMethod,
    PaymentStatus,
    ScheduleStatus,
    SeatType,
    TicketStatus,
    UserRole,
    UserStatus,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Auth / User
# ---------------------------------------------------------------------------


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=72)
    date_of_birth: date | None = None


class UserOut(ORMModel):
    id: UUID
    name: str | None
    email: str
    phone: str | None
    role: UserRole
    status: UserStatus
    date_of_birth: date | None
    created_at: datetime | None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# Station
# ---------------------------------------------------------------------------


class StationCreate(BaseModel):
    station_code: str = Field(max_length=10)
    name: str = Field(max_length=150)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    status: ActiveInactiveStatus = ActiveInactiveStatus.ACTIVE


class StationOut(ORMModel):
    id: UUID
    station_code: str
    name: str
    city: str | None
    state: str | None
    status: ActiveInactiveStatus


# ---------------------------------------------------------------------------
# Train
# ---------------------------------------------------------------------------


class TrainCreate(BaseModel):
    train_number: str = Field(max_length=20)
    name: str = Field(max_length=150)
    train_type: str | None = Field(default=None, max_length=50)
    status: ActiveInactiveStatus = ActiveInactiveStatus.ACTIVE


class TrainOut(ORMModel):
    id: UUID
    train_number: str
    name: str
    train_type: str | None
    status: ActiveInactiveStatus
    created_at: datetime | None


# ---------------------------------------------------------------------------
# Route / RouteStop
# ---------------------------------------------------------------------------


class RouteStopCreate(BaseModel):
    station_id: UUID
    stop_sequence: int
    arrival_time: time | None = None
    departure_time: time | None = None
    day_offset: int = 0


class RouteStopOut(ORMModel):
    id: UUID
    station: StationOut
    stop_sequence: int
    arrival_time: time | None
    departure_time: time | None
    day_offset: int


class RouteCreate(BaseModel):
    train_id: UUID
    name: str = Field(max_length=150)
    status: ActiveInactiveStatus = ActiveInactiveStatus.ACTIVE
    stops: list[RouteStopCreate] = Field(min_length=2)


class RouteOut(ORMModel):
    id: UUID
    train_id: UUID
    name: str
    status: ActiveInactiveStatus
    stops: list[RouteStopOut]


# ---------------------------------------------------------------------------
# Coach / Seat
# ---------------------------------------------------------------------------


class CoachCreate(BaseModel):
    train_id: UUID
    coach_number: str = Field(max_length=20)
    coach_type: CoachType
    seat_capacity: int = Field(gt=0)
    base_fare: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class CoachOut(ORMModel):
    id: UUID
    train_id: UUID
    coach_number: str
    coach_type: CoachType
    seat_capacity: int
    base_fare: Decimal


class SeatCreate(BaseModel):
    seat_number: str = Field(max_length=10)
    seat_type: SeatType
    row_number: int = Field(ge=1)
    column_number: int = Field(ge=1)


class SeatBulkCreate(BaseModel):
    seats: list[SeatCreate] = Field(min_length=1)


class SeatOut(ORMModel):
    id: UUID
    coach_id: UUID
    seat_number: str
    seat_type: SeatType
    row_number: int
    column_number: int


class SeatStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    TAKEN = "TAKEN"


class SeatMapEntry(ORMModel):
    id: UUID
    seat_number: str
    seat_type: SeatType
    row_number: int
    column_number: int
    status: SeatStatus


class CoachSeatMap(BaseModel):
    coach_id: UUID
    coach_number: str
    coach_type: CoachType
    base_fare: Decimal
    seats: list[SeatMapEntry]


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------


class ScheduleCreate(BaseModel):
    train_id: UUID
    route_id: UUID
    journey_date: date
    departure_time: datetime
    arrival_time: datetime
    status: ScheduleStatus = ScheduleStatus.SCHEDULED


class ScheduleOut(ORMModel):
    id: UUID
    train_id: UUID
    route_id: UUID
    journey_date: date
    departure_time: datetime
    arrival_time: datetime
    status: ScheduleStatus


class ScheduleDetailOut(ScheduleOut):
    train: TrainOut
    route: RouteOut


class CoachAvailability(BaseModel):
    coach_type: CoachType
    base_fare: Decimal
    total_seats: int
    available_seats: int


class ScheduleSearchResult(ORMModel):
    id: UUID
    train: TrainOut
    journey_date: date
    departure_time: datetime
    arrival_time: datetime
    status: ScheduleStatus
    coach_availability: list[CoachAvailability]


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------


class PassengerCreate(BaseModel):
    name: str = Field(max_length=100)
    date_of_birth: date | None = None
    gender: Gender
    berth_preference: BerthPreference = BerthPreference.NO_PREFERENCE
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)


class PassengerOut(ORMModel):
    id: UUID
    name: str
    date_of_birth: date | None
    gender: Gender
    berth_preference: BerthPreference | None
    email: str | None
    phone: str | None


class BookingCreate(BaseModel):
    schedule_id: UUID
    source_station_id: UUID
    destination_station_id: UUID
    # Seat chosen by the customer in the seat map, paired 1:1 by list
    # position with `passengers` (seat_ids[i] is assigned to passengers[i]).
    seat_ids: list[UUID] = Field(min_length=1, max_length=6)
    passengers: list[PassengerCreate] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def _check_seat_passenger_counts_match(self) -> "BookingCreate":
        if len(self.seat_ids) != len(self.passengers):
            raise ValueError("seat_ids and passengers must be the same length")
        if len(set(self.seat_ids)) != len(self.seat_ids):
            raise ValueError("seat_ids must not contain duplicates")
        return self


class BookingSeatOut(ORMModel):
    id: UUID
    seat: SeatOut
    passenger_id: UUID
    fare: Decimal
    status: BookingSeatStatus


class BookingOut(ORMModel):
    id: UUID
    booking_reference: str
    user_id: UUID
    schedule_id: UUID
    source_station_id: UUID
    destination_station_id: UUID
    booking_date: datetime | None
    total_amount: Decimal
    status: BookingStatus
    passengers: list[PassengerOut]
    booking_seats: list[BookingSeatOut]


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------


class PaymentCreate(BaseModel):
    payment_method: PaymentMethod


class PaymentOut(ORMModel):
    id: UUID
    booking_id: UUID
    payment_reference: str
    amount: Decimal
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    transaction_time: datetime | None


# ---------------------------------------------------------------------------
# Ticket
# ---------------------------------------------------------------------------


class TicketOut(ORMModel):
    id: UUID
    booking_id: UUID
    ticket_number: str
    ticket_status: TicketStatus
    pdf_url: str | None
    issued_at: datetime | None
    cancelled_at: datetime | None


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------


class FeedbackCreate(BaseModel):
    booking_id: UUID | None = None
    rating: int = Field(ge=1, le=5)
    subject: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=1)


class FeedbackOut(ORMModel):
    id: UUID
    user_id: UUID
    booking_id: UUID | None
    rating: int
    subject: str | None
    message: str
    status: FeedbackStatus
    admin_response: str | None
    created_at: datetime | None


class FeedbackRespond(BaseModel):
    admin_response: str = Field(min_length=1)
    status: FeedbackStatus = FeedbackStatus.RESOLVED
