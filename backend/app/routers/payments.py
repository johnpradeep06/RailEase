"""Payments: Razorpay (test mode) with a mock fallback when no keys are set.

Flow
  POST /bookings/{id}/pay/order    create a Razorpay order for the booking's total
  (browser)                        Razorpay Checkout collects the payment
  POST /bookings/{id}/pay/verify   server verifies HMAC + asks Razorpay, THEN confirms
  POST /bookings/{id}/pay/cancel   customer closed / failed checkout -> seats released
  POST /payments/razorpay/webhook  safety net if the browser never reports back

A booking is only ever CONFIRMED by server-side code after the gateway has
confirmed the money — never because the client says so.
"""
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, razorpay_client as rz, schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..services import booking_service as svc

log = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["payments"])
gateway_router = APIRouter(prefix="/payments", tags=["payments"])

_NOT_PAYABLE = {
    models.BookingStatus.EXPIRED: "The seat lock expired — please select your seats again",
    models.BookingStatus.CANCELLED: "This booking was cancelled",
    models.BookingStatus.CONFIRMED: "This booking is already paid",
}


def _load_booking(db: Session, booking_id: UUID, user: models.User, *, lock: bool = False) -> models.Booking:
    stmt = select(models.Booking).where(models.Booking.id == booking_id)
    if lock:
        # populate_existing: the row may already be in the session with stale state.
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    booking = db.execute(stmt).scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to pay for this booking")
    return booking


def _require_pending(booking: models.Booking) -> None:
    if booking.status != models.BookingStatus.PENDING:
        raise HTTPException(
            status_code=409, detail=_NOT_PAYABLE.get(booking.status, f"Booking is {booking.status.value}")
        )


@gateway_router.get("/config", response_model=schemas.PaymentConfig)
def payment_config():
    return schemas.PaymentConfig(
        provider="razorpay" if settings.razorpay_enabled else "mock",
        key_id=settings.razorpay_key_id or None,
        seat_lock_minutes=settings.seat_lock_minutes,
    )


# ---------------------------------------------------------------------------
# Razorpay
# ---------------------------------------------------------------------------


@router.post("/{booking_id}/pay/order", response_model=schemas.PaymentOrderOut)
def create_payment_order(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not settings.razorpay_enabled:
        raise HTTPException(status_code=503, detail="Razorpay is not configured on this server")

    svc.expire_stale_holds(db)
    booking = _load_booking(db, booking_id, current_user)
    _require_pending(booking)

    # Re-opening checkout for the same booking reuses its open order.
    payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.booking_id == booking.id,
            models.Payment.razorpay_order_id.is_not(None),
            models.Payment.payment_status == models.PaymentStatus.PENDING,
        )
        .first()
    )
    if payment is None:
        try:
            order = rz.create_order(
                svc.paise(booking.total_amount),
                booking.booking_reference,
                {"booking_id": str(booking.id)},
            )
        except rz.RazorpayError as e:
            raise HTTPException(status_code=502, detail=f"Payment gateway error: {e}")
        payment = models.Payment(
            booking_id=booking.id,
            payment_reference=svc.generate_payment_reference(),
            amount=booking.total_amount,
            payment_method=None,
            payment_status=models.PaymentStatus.PENDING,
            razorpay_order_id=order["id"],
        )
        db.add(payment)
        db.commit()

    return schemas.PaymentOrderOut(
        key_id=settings.razorpay_key_id,
        order_id=payment.razorpay_order_id,
        amount=svc.paise(payment.amount),
        currency="INR",
        booking_reference=booking.booking_reference,
        expires_at=booking.expires_at,
    )


@router.post("/{booking_id}/pay/verify", response_model=schemas.PaymentOut)
def verify_payment(
    booking_id: UUID,
    payload: schemas.PaymentVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    svc.expire_stale_holds(db)
    booking = _load_booking(db, booking_id, current_user)
    payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.booking_id == booking.id,
            models.Payment.razorpay_order_id == payload.razorpay_order_id,
        )
        .first()
    )
    if payment is None:
        raise HTTPException(status_code=400, detail="Unknown payment order for this booking")
    if payment.payment_status == models.PaymentStatus.SUCCESS and booking.status == models.BookingStatus.CONFIRMED:
        return payment  # replay of a call that already succeeded

    # 1. Authenticity: was this callback really produced by Razorpay for this order?
    if not rz.verify_signature(
        payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature
    ):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    # 2. Never trust the browser: ask Razorpay what actually happened.
    try:
        gp = rz.fetch_payment(payload.razorpay_payment_id)
    except rz.RazorpayError as e:
        raise HTTPException(status_code=502, detail=f"Could not confirm the payment with Razorpay: {e}")
    if gp.get("order_id") != payment.razorpay_order_id or int(gp.get("amount", 0)) != svc.paise(payment.amount):
        raise HTTPException(status_code=400, detail="Payment does not match this order")
    if gp.get("status") == "authorized":
        try:
            gp = rz.capture_payment(gp["id"], svc.paise(payment.amount))
        except rz.RazorpayError as e:
            raise HTTPException(status_code=502, detail=f"Could not capture the payment: {e}")
    if gp.get("status") != "captured":
        payment.failure_reason = gp.get("error_description") or f"Gateway status: {gp.get('status')}"
        db.commit()
        raise HTTPException(status_code=402, detail="Payment was not completed")

    # 3. Confirm atomically under a row lock (serialises with cancel / expiry / webhook).
    booking = _load_booking(db, booking_id, current_user, lock=True)
    db.refresh(payment)
    outcome = svc.apply_captured_payment(db, booking, payment, gp)
    db.refresh(payment)
    if outcome == "confirmed":
        return payment
    raise HTTPException(
        status_code=409,
        detail=(
            "Your payment arrived after the seat lock expired and the seats were taken, "
            + ("so it has been refunded." if outcome == "refunded" else "and the automatic refund failed — contact support.")
        ),
    )


@router.post("/{booking_id}/pay/cancel", response_model=schemas.BookingOut)
def cancel_payment(
    booking_id: UUID,
    payload: schemas.PaymentCancel,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Checkout was closed or failed: record why and release the seats now."""
    svc.expire_stale_holds(db)
    booking = _load_booking(db, booking_id, current_user, lock=True)
    if booking.status == models.BookingStatus.PENDING:
        reason = f"Payment {payload.reason}" + (f": {payload.detail}" if payload.detail else "")
        svc.release_pending(db, booking, models.BookingStatus.CANCELLED, reason)
    # Anything else was settled meanwhile (paid via webhook, expired, ...): leave it.
    db.commit()
    return booking


@router.post("/{booking_id}/pay/reconcile", response_model=schemas.BookingOut)
def reconcile_payment(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Ask Razorpay whether this booking's order was actually paid.

    Covers "interrupted" payments without needing a webhook: the customer paid
    but closed the tab / lost connection before /pay/verify ran. Safe to call any
    number of times; settlement is the same idempotent routine verify uses.
    """
    svc.expire_stale_holds(db)
    booking = _load_booking(db, booking_id, current_user)
    if not settings.razorpay_enabled or booking.status == models.BookingStatus.CONFIRMED:
        return booking

    payments = (
        db.query(models.Payment)
        .filter(
            models.Payment.booking_id == booking.id,
            models.Payment.razorpay_order_id.is_not(None),
            models.Payment.payment_status.in_([models.PaymentStatus.PENDING, models.PaymentStatus.FAILED]),
        )
        .all()
    )
    for payment in payments:
        try:
            items = rz.fetch_order_payments(payment.razorpay_order_id)
        except rz.RazorpayError:
            continue
        paid = next(
            (
                p
                for p in items
                if p.get("status") in ("captured", "authorized")
                and int(p.get("amount", 0)) == svc.paise(payment.amount)
            ),
            None,
        )
        if paid is None:
            continue
        try:
            if paid["status"] == "authorized":
                paid = rz.capture_payment(paid["id"], svc.paise(payment.amount))
        except rz.RazorpayError:
            continue
        booking = _load_booking(db, booking_id, current_user, lock=True)
        db.refresh(payment)
        svc.apply_captured_payment(db, booking, payment, paid)
        break

    db.refresh(booking)
    return booking


# ---------------------------------------------------------------------------
# Mock gateway (only when Razorpay keys are not configured — local dev / fallback)
# ---------------------------------------------------------------------------


@router.post("/{booking_id}/pay", response_model=schemas.PaymentOut)
def pay_for_booking_mock(
    booking_id: UUID,
    payload: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if settings.razorpay_enabled:
        raise HTTPException(status_code=403, detail="Payments go through Razorpay — use /pay/order")

    svc.expire_stale_holds(db)
    booking = _load_booking(db, booking_id, current_user, lock=True)
    _require_pending(booking)

    payment = models.Payment(
        booking_id=booking.id,
        payment_reference=svc.generate_payment_reference(),
        amount=booking.total_amount,
        payment_method=payload.payment_method,
        payment_status=models.PaymentStatus.PENDING,
    )
    db.add(payment)
    db.flush()
    svc.mark_paid(db, booking, payment)
    db.commit()
    db.refresh(payment)
    return payment


# ---------------------------------------------------------------------------
# Webhook — makes "interrupted" payments (tab closed after paying) self-heal
# ---------------------------------------------------------------------------


def _handle_webhook_event(db: Session, event: dict) -> str:
    name = event.get("event")
    entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = entity.get("order_id")
    if not order_id:
        return "ignored"
    payment = db.query(models.Payment).filter(models.Payment.razorpay_order_id == order_id).first()
    if payment is None:
        return "unknown order"

    if name in ("payment.captured", "order.paid"):
        if entity.get("status") != "captured" or int(entity.get("amount", 0)) != svc.paise(payment.amount):
            return "mismatch"
        booking = db.execute(
            select(models.Booking)
            .where(models.Booking.id == payment.booking_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).scalar_one()
        db.refresh(payment)
        return svc.apply_captured_payment(db, booking, payment, entity)

    if name == "payment.failed":
        # One failed attempt does not end checkout (the customer can retry inside
        # the modal), so just record why; the seats stay locked until the deadline.
        if payment.payment_status == models.PaymentStatus.PENDING:
            payment.failure_reason = entity.get("error_description") or "Payment attempt failed"
            db.commit()
        return "recorded"

    return "ignored"


@gateway_router.post("/razorpay/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.razorpay_enabled or not settings.razorpay_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook is not configured")
    body = await request.body()
    if not rz.verify_webhook_signature(body, request.headers.get("X-Razorpay-Signature", "")):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    try:
        result = await run_in_threadpool(_handle_webhook_event, db, json.loads(body))
    except Exception:  # never make Razorpay retry forever on our bug
        log.exception("razorpay webhook handling failed")
        result = "error"
    return {"status": result}
