import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Native Postgres ENUM that stores member .value, not the Python member name."""
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class UserRole(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    INACTIVE = "INACTIVE"


class ActiveInactiveStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class ScheduleStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class CoachType(str, enum.Enum):
    AC_FIRST = "1AC"
    AC_SECOND = "2AC"
    AC_THIRD = "3AC"
    SLEEPER = "SL"
    CHAIR_CAR = "CC"


class SeatType(str, enum.Enum):
    LOWER = "LOWER"
    MIDDLE = "MIDDLE"
    UPPER = "UPPER"
    SIDE_LOWER = "SIDE_LOWER"
    SIDE_UPPER = "SIDE_UPPER"
    SEAT = "SEAT"


class BookingStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    WAITLISTED = "WAITLISTED"
    CANCELLED = "CANCELLED"


class Gender(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"


class BerthPreference(str, enum.Enum):
    LOWER = "LOWER"
    MIDDLE = "MIDDLE"
    UPPER = "UPPER"
    SIDE_LOWER = "SIDE_LOWER"
    SIDE_UPPER = "SIDE_UPPER"
    NO_PREFERENCE = "NO_PREFERENCE"


class BookingSeatStatus(str, enum.Enum):
    RESERVED = "RESERVED"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


class PaymentMethod(str, enum.Enum):
    UPI = "UPI"
    CARD = "CARD"
    NET_BANKING = "NET_BANKING"
    WALLET = "WALLET"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class TicketStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"


class FeedbackStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100))
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20), unique=True)
    password_hash = Column(Text, nullable=False)
    role = Column(pg_enum(UserRole, "user_role"), nullable=False, default=UserRole.CUSTOMER)
    date_of_birth = Column(Date)
    status = Column(pg_enum(UserStatus, "user_status"), nullable=False, default=UserStatus.ACTIVE)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    bookings = relationship("Booking", back_populates="user")
    feedback_entries = relationship("Feedback", back_populates="user")


class Train(Base):
    __tablename__ = "trains"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    train_number = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    train_type = Column(String(50))
    status = Column(
        pg_enum(ActiveInactiveStatus, "active_inactive_status"),
        nullable=False,
        default=ActiveInactiveStatus.ACTIVE,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    routes = relationship("Route", back_populates="train")
    schedules = relationship("Schedule", back_populates="train")
    coaches = relationship("Coach", back_populates="train", cascade="all, delete-orphan")


class Route(Base):
    __tablename__ = "routes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    train_id = Column(UUID(as_uuid=True), ForeignKey("trains.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    status = Column(
        pg_enum(ActiveInactiveStatus, "active_inactive_status"),
        nullable=False,
        default=ActiveInactiveStatus.ACTIVE,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    train = relationship("Train", back_populates="routes")
    stops = relationship(
        "RouteStop",
        back_populates="route",
        order_by="RouteStop.stop_sequence",
        cascade="all, delete-orphan",
    )
    schedules = relationship("Schedule", back_populates="route")


class Station(Base):
    __tablename__ = "stations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    station_code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    city = Column(String(100))
    state = Column(String(100))
    status = Column(
        pg_enum(ActiveInactiveStatus, "active_inactive_status"),
        nullable=False,
        default=ActiveInactiveStatus.ACTIVE,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    route_stops = relationship("RouteStop", back_populates="station")


class RouteStop(Base):
    __tablename__ = "route_stops"
    __table_args__ = (
        UniqueConstraint("route_id", "stop_sequence", name="uq_route_stop_sequence"),
        UniqueConstraint("route_id", "station_id", name="uq_route_station"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id = Column(UUID(as_uuid=True), ForeignKey("routes.id"), nullable=False, index=True)
    station_id = Column(UUID(as_uuid=True), ForeignKey("stations.id"), nullable=False, index=True)
    stop_sequence = Column(Integer, nullable=False)
    arrival_time = Column(Time)
    departure_time = Column(Time)
    day_offset = Column(Integer, nullable=False, default=0)

    route = relationship("Route", back_populates="stops")
    station = relationship("Station", back_populates="route_stops")


class Schedule(Base):
    __tablename__ = "schedules"
    __table_args__ = (Index("ix_schedules_train_journey_date", "train_id", "journey_date"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    train_id = Column(UUID(as_uuid=True), ForeignKey("trains.id"), nullable=False)
    route_id = Column(UUID(as_uuid=True), ForeignKey("routes.id"), nullable=False)
    journey_date = Column(Date, nullable=False)
    departure_time = Column(DateTime(timezone=True), nullable=False)
    arrival_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(
        pg_enum(ScheduleStatus, "schedule_status"), nullable=False, default=ScheduleStatus.SCHEDULED
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    train = relationship("Train", back_populates="schedules")
    route = relationship("Route", back_populates="schedules")
    bookings = relationship("Booking", back_populates="schedule")


class Coach(Base):
    __tablename__ = "coaches"
    __table_args__ = (UniqueConstraint("train_id", "coach_number", name="uq_train_coach_number"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    train_id = Column(UUID(as_uuid=True), ForeignKey("trains.id"), nullable=False, index=True)
    coach_number = Column(String(20), nullable=False)
    coach_type = Column(pg_enum(CoachType, "coach_type"), nullable=False)
    seat_capacity = Column(Integer, nullable=False)
    base_fare = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    train = relationship("Train", back_populates="coaches")
    seats = relationship("Seat", back_populates="coach", cascade="all, delete-orphan")


class Seat(Base):
    __tablename__ = "seats"
    __table_args__ = (
        UniqueConstraint("coach_id", "seat_number", name="uq_coach_seat_number"),
        UniqueConstraint("coach_id", "row_number", "column_number", name="uq_coach_seat_position"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    coach_id = Column(UUID(as_uuid=True), ForeignKey("coaches.id"), nullable=False, index=True)
    seat_number = Column(String(10), nullable=False)
    seat_type = Column(pg_enum(SeatType, "seat_type"), nullable=False)
    # Explicit grid coordinate so the frontend can render a seat map directly
    # (theater-style: row + position-in-row) instead of parsing seat_number.
    # Sleeper: row = bay number, column = position within the bay (mirrors
    # seat_type's berth level). Chair car: row = physical row, column = seat
    # left-to-right in that row.
    row_number = Column(Integer, nullable=False)
    column_number = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    coach = relationship("Coach", back_populates="seats")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_user_id", "user_id"),
        Index("ix_bookings_schedule_id", "schedule_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_reference = Column(String(20), unique=True, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    schedule_id = Column(UUID(as_uuid=True), ForeignKey("schedules.id"), nullable=False)
    source_station_id = Column(UUID(as_uuid=True), ForeignKey("stations.id"), nullable=False)
    destination_station_id = Column(UUID(as_uuid=True), ForeignKey("stations.id"), nullable=False)
    booking_date = Column(DateTime(timezone=True), server_default=func.now())
    total_amount = Column(Numeric(10, 2), nullable=False)
    status = Column(pg_enum(BookingStatus, "booking_status"), nullable=False, default=BookingStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="bookings")
    schedule = relationship("Schedule", back_populates="bookings")
    source_station = relationship("Station", foreign_keys=[source_station_id])
    destination_station = relationship("Station", foreign_keys=[destination_station_id])
    passengers = relationship("Passenger", back_populates="booking", cascade="all, delete-orphan")
    booking_seats = relationship("BookingSeat", back_populates="booking", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="booking", cascade="all, delete-orphan")
    ticket = relationship("Ticket", back_populates="booking", uselist=False, cascade="all, delete-orphan")
    feedback_entries = relationship("Feedback", back_populates="booking")


class Passenger(Base):
    __tablename__ = "passengers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    date_of_birth = Column(Date)
    gender = Column(pg_enum(Gender, "gender"), nullable=False)
    berth_preference = Column(
        pg_enum(BerthPreference, "berth_preference"), default=BerthPreference.NO_PREFERENCE
    )
    email = Column(String(255))
    phone = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    booking = relationship("Booking", back_populates="passengers")
    booking_seat = relationship("BookingSeat", back_populates="passenger", uselist=False)


class BookingSeat(Base):
    __tablename__ = "booking_seats"
    __table_args__ = (
        Index("ix_booking_seats_booking_id", "booking_id"),
        Index(
            "uq_active_seat_per_schedule",
            "schedule_id",
            "seat_id",
            unique=True,
            postgresql_where=text("status IN ('RESERVED', 'CONFIRMED')"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False)
    # Denormalized from booking.schedule_id at write time so the partial unique
    # index above can enforce "no seat double-booked on the same schedule" at
    # the DB level, independent of the app-level SKIP LOCKED query.
    schedule_id = Column(UUID(as_uuid=True), ForeignKey("schedules.id"), nullable=False)
    seat_id = Column(UUID(as_uuid=True), ForeignKey("seats.id"), nullable=False)
    passenger_id = Column(UUID(as_uuid=True), ForeignKey("passengers.id"), nullable=False)
    fare = Column(Numeric(10, 2), nullable=False)
    status = Column(
        pg_enum(BookingSeatStatus, "booking_seat_status"),
        nullable=False,
        default=BookingSeatStatus.RESERVED,
    )

    booking = relationship("Booking", back_populates="booking_seats")
    seat = relationship("Seat")
    passenger = relationship("Passenger", back_populates="booking_seat")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_booking_id", "booking_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False)
    payment_reference = Column(String(100), unique=True, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    payment_method = Column(pg_enum(PaymentMethod, "payment_method"), nullable=False)
    payment_status = Column(
        pg_enum(PaymentStatus, "payment_status"), nullable=False, default=PaymentStatus.PENDING
    )
    transaction_time = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    booking = relationship("Booking", back_populates="payments")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), unique=True, nullable=False)
    ticket_number = Column(String(30), unique=True, nullable=False)
    ticket_status = Column(pg_enum(TicketStatus, "ticket_status"), nullable=False, default=TicketStatus.ACTIVE)
    pdf_url = Column(Text)
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    booking = relationship("Booking", back_populates="ticket")


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=True)
    rating = Column(Integer, nullable=False)
    subject = Column(String(200))
    message = Column(Text, nullable=False)
    status = Column(pg_enum(FeedbackStatus, "feedback_status"), nullable=False, default=FeedbackStatus.OPEN)
    admin_response = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="feedback_entries")
    booking = relationship("Booking", back_populates="feedback_entries")
