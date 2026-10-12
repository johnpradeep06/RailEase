"""Minimal Razorpay REST client (stdlib only — no extra dependency to deploy).

Only the handful of calls this app needs:
  create_order      POST /orders
  fetch_payment     GET  /payments/{id}
  fetch_order_payments GET /orders/{id}/payments
  capture_payment   POST /payments/{id}/capture
  refund_payment    POST /payments/{id}/refund
plus the two HMAC checks (checkout signature, webhook signature).

Use `rzp_test_*` keys for the demo — nothing here moves real money.
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from . import models
from .config import settings

API_BASE = "https://api.razorpay.com/v1"


class RazorpayError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _request(method: str, path: str, body: dict | None = None) -> dict:
    token = base64.b64encode(
        f"{settings.razorpay_key_id}:{settings.razorpay_key_secret}".encode()
    ).decode()
    req = urllib.request.Request(
        API_BASE + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            detail = json.loads(raw)["error"]["description"]
        except Exception:
            detail = raw.decode(errors="replace")[:200]
        raise RazorpayError(detail, e.code) from None
    except urllib.error.URLError as e:
        raise RazorpayError(f"Razorpay unreachable: {e.reason}") from None


def create_order(amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
    return _request(
        "POST",
        "/orders",
        {"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes or {}},
    )


def fetch_payment(payment_id: str) -> dict:
    return _request("GET", f"/payments/{payment_id}")


def fetch_order_payments(order_id: str) -> list[dict]:
    return _request("GET", f"/orders/{order_id}/payments").get("items", [])


def capture_payment(payment_id: str, amount_paise: int) -> dict:
    return _request("POST", f"/payments/{payment_id}/capture", {"amount": amount_paise, "currency": "INR"})


def refund_payment(payment_id: str, amount_paise: int, notes: dict | None = None) -> dict:
    return _request("POST", f"/payments/{payment_id}/refund", {"amount": amount_paise, "notes": notes or {}})


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Checkout callback signature: HMAC_SHA256(order_id|payment_id, key_secret)."""
    expected = _hmac_hex(settings.razorpay_key_secret, f"{order_id}|{payment_id}".encode())
    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """Webhook signature: HMAC_SHA256(raw request body, webhook_secret)."""
    if not settings.razorpay_webhook_secret:
        return False
    expected = _hmac_hex(settings.razorpay_webhook_secret, raw_body)
    return hmac.compare_digest(expected, signature or "")


_METHODS = {
    "upi": models.PaymentMethod.UPI,
    "card": models.PaymentMethod.CARD,
    "netbanking": models.PaymentMethod.NET_BANKING,
    "wallet": models.PaymentMethod.WALLET,
}


def map_method(method: str | None) -> models.PaymentMethod:
    return _METHODS.get((method or "").lower(), models.PaymentMethod.OTHER)
