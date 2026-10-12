"""End-to-end check of seat locking + payment handling against a real database.

    DATABASE_URL=... python payment_flow_check.py razorpay   # Razorpay paths (fake gateway)
    DATABASE_URL=... python payment_flow_check.py mock       # mock-gateway paths

Starts the real FastAPI app in-process, replaces only the *network call to
Razorpay* with an in-memory fake (everything else — HMAC checks, row locks,
the unique index, expiry — is the production code), then walks every scenario:
paid, bad signature, amount mismatch, declined, cancelled, expired, paid-after-
expiry (reinstated / refunded), webhook, replay, someone else's booking.

The DB must be seeded (seed.py). Touches only the race<N>@railease.test users.
"""
import os
import sys
import threading
import time
import uuid

MODE = sys.argv[1] if len(sys.argv) > 1 else "razorpay"
assert MODE in ("razorpay", "mock")

if MODE == "razorpay":
    os.environ.update(
        RAZORPAY_KEY_ID="rzp_test_fakekey",
        RAZORPAY_KEY_SECRET="fake_key_secret",
        RAZORPAY_WEBHOOK_SECRET="fake_webhook_secret",
    )
else:
    for k in ("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"):
        os.environ[k] = ""

import uvicorn  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import razorpay_client as rz  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from race_demo import call, find_schedule, free_seats, login, passenger  # noqa: E402

PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"
results = []


def check(name, cond, extra=""):
    results.append(cond)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{('  ' + str(extra)) if extra and not cond else ''}")


# ---------------------------------------------------------------- fake Razorpay
class FakeGateway:
    def __init__(self):
        self.tag = uuid.uuid4().hex[:6]  # ids must be unique across runs (DB keeps them)
        self.orders, self.payments, self.refunds, self.n = {}, {}, [], 0

    def request(self, method, path, body=None):
        if method == "POST" and path == "/orders":
            self.n += 1
            oid = f"order_{self.tag}{self.n}"
            self.orders[oid] = body
            return {"id": oid, "amount": body["amount"], "currency": "INR"}
        if method == "GET" and path.startswith("/payments/"):
            return dict(self.payments[path.split("/")[2]])
        if method == "GET" and path.startswith("/orders/") and path.endswith("/payments"):
            oid = path.split("/")[2]
            return {"items": [dict(p) for p in self.payments.values() if p["order_id"] == oid]}
        if path.endswith("/capture"):
            p = self.payments[path.split("/")[2]]
            p["status"] = "captured"
            return dict(p)
        if path.endswith("/refund"):
            self.refunds.append(path.split("/")[2])
            return {"id": "rfnd_fake"}
        raise AssertionError(f"unexpected gateway call {method} {path}")

    def pay(self, order_id, status="captured", amount=None, method="upi"):
        pid = f"pay_{self.tag}{len(self.payments) + 1}"
        self.payments[pid] = {
            "id": pid, "order_id": order_id, "method": method, "status": status,
            "amount": amount if amount is not None else self.orders[order_id]["amount"],
        }
        return pid


GW = FakeGateway()
rz._request = GW.request  # the only thing replaced: the network hop to Razorpay


def sign(order_id, payment_id):
    return rz._hmac_hex(os.environ["RAZORPAY_KEY_SECRET"], f"{order_id}|{payment_id}".encode())


# ---------------------------------------------------------------------- helpers
def sql(stmt, **params):
    with SessionLocal() as db:
        db.execute(text(stmt), params)
        db.commit()


def seat_status(sid, seat_id):
    _, maps = call(BASE, "GET", f"/schedules/{sid}/seats?coach_type=SL")
    return next(s["status"] for m in maps for s in m["seats"] if s["id"] == seat_id)


def start_server():
    cfg = uvicorn.Config("app.main:app", host="127.0.0.1", port=PORT, log_level="warning")
    threading.Thread(target=uvicorn.Server(cfg).run, daemon=True).start()
    for _ in range(60):
        try:
            if call(BASE, "GET", "/health")[0] == 200:
                return
        except Exception:
            pass
        time.sleep(0.25)
    raise SystemExit("server did not start")


def main():
    start_server()
    t1, t2 = login(BASE, 1), login(BASE, 2)
    sid = find_schedule(BASE)
    _, sched = call(BASE, "GET", f"/schedules/{sid}")
    stops = {s["station"]["station_code"]: s["station"]["id"] for s in sched["route"]["stops"]}
    seats = iter(free_seats(BASE, sid))

    def book(token, seat=None):
        seat = seat or next(seats)
        st, b = call(BASE, "POST", "/bookings", {
            "schedule_id": sid, "source_station_id": stops["NDLS"], "destination_station_id": stops["BCT"],
            "seat_ids": [seat], "passengers": [passenger(1)]}, token)
        assert st == 201, (st, b)
        return b, seat

    def expire(booking_id):
        sql("UPDATE bookings SET expires_at = now() - interval '1 minute' WHERE id = :i", i=booking_id)

    def booking(token, booking_id):
        return call(BASE, "GET", f"/bookings/{booking_id}", token=token)[1]

    print(f"\n== config ({MODE}) ==")
    cfg = call(BASE, "GET", "/payments/config")[1]
    check("config reports provider", cfg["provider"] == MODE, cfg)

    print("\n== seat lock lifecycle ==")
    b, seat = book(t1)
    check("new booking is PENDING with a lock deadline", b["status"] == "PENDING" and b["expires_at"], b["status"])
    check("locked seat shows TAKEN to everyone", seat_status(sid, seat) == "TAKEN")
    st, _ = call(BASE, "POST", "/bookings", {
        "schedule_id": sid, "source_station_id": stops["NDLS"], "destination_station_id": stops["BCT"],
        "seat_ids": [seat], "passengers": [passenger(2)]}, t2)
    check("a second user cannot take a locked seat (409)", st == 409, st)
    call(BASE, "DELETE", f"/bookings/{b['id']}", token=t1)
    check("cancelling releases the seat", seat_status(sid, seat) == "AVAILABLE")

    b, seat = book(t1)
    expire(b["id"])
    check("expired lock frees the seat on the next read", seat_status(sid, seat) == "AVAILABLE")
    check("booking reads back as EXPIRED", booking(t1, b["id"])["status"] == "EXPIRED")
    b2, _ = book(t2, seat)
    check("another user can now book that seat", b2["status"] == "PENDING")
    call(BASE, "DELETE", f"/bookings/{b2['id']}", token=t2)

    print("\n== expiry sweep vs a booking being settled ==")
    from app.services import booking_service  # noqa: E402

    def db_status(booking_id):
        with SessionLocal() as db:
            return db.execute(text("select status from bookings where id=:i"), {"i": booking_id}).scalar()

    b, seat = book(t1)
    expire(b["id"])  # deadline passed, but a payment confirmation holds the row lock
    locker = SessionLocal()
    locker.execute(text("select id from bookings where id=:i for update"), {"i": b["id"]})
    with SessionLocal() as other:
        t0 = time.time()
        booking_service.expire_stale_holds(other)
        waited = time.time() - t0
    check("sweep does not block on the locked booking", waited < 1.5, f"{waited:.1f}s")
    check("...and leaves it alone (still PENDING)", db_status(b["id"]) == "PENDING")
    locker.rollback()
    locker.close()
    with SessionLocal() as other:
        booking_service.expire_stale_holds(other)
    check("once unlocked the next sweep expires it", db_status(b["id"]) == "EXPIRED")

    if MODE == "mock":
        print("\n== mock gateway ==")
        b, seat = book(t1)
        st, p = call(BASE, "POST", f"/bookings/{b['id']}/pay", {"payment_method": "UPI"}, t1)
        check("mock pay confirms the booking", st == 200 and booking(t1, b["id"])["status"] == "CONFIRMED", (st, p))
        check("ticket issued", call(BASE, "GET", f"/tickets/{b['id']}", token=t1)[0] == 200)
        check("second pay is rejected (409)", call(BASE, "POST", f"/bookings/{b['id']}/pay", {"payment_method": "UPI"}, t1)[0] == 409)
        b, _ = book(t1)
        expire(b["id"])
        check("cannot pay an expired booking (409)", call(BASE, "POST", f"/bookings/{b['id']}/pay", {"payment_method": "UPI"}, t1)[0] == 409)
        check("Razorpay order endpoint disabled (503)", call(BASE, "POST", f"/bookings/{b['id']}/pay/order", token=t1)[0] == 503)
    else:
        def order(token, booking_id):
            st, o = call(BASE, "POST", f"/bookings/{booking_id}/pay/order", token=token)
            assert st == 200, (st, o)
            return o

        def verify(token, booking_id, o, pid, sig=None):
            return call(BASE, "POST", f"/bookings/{booking_id}/pay/verify", {
                "razorpay_order_id": o["order_id"], "razorpay_payment_id": pid,
                "razorpay_signature": sig if sig is not None else sign(o["order_id"], pid)}, token)

        print("\n== razorpay: paid ==")
        b, seat = book(t1)
        o = order(t1, b["id"])
        check("order amount = booking total in paise", o["amount"] == int(float(b["total_amount"]) * 100), o["amount"])
        check("re-opening checkout reuses the same order", order(t1, b["id"])["order_id"] == o["order_id"])
        check("mock pay endpoint is disabled (403)", call(BASE, "POST", f"/bookings/{b['id']}/pay", {"payment_method": "UPI"}, t1)[0] == 403)
        pid = GW.pay(o["order_id"], method="upi")
        st, p = verify(t1, b["id"], o, pid)
        check("verified payment -> 200 SUCCESS", st == 200 and p["payment_status"] == "SUCCESS", (st, p))
        check("method taken from the gateway record", p["payment_method"] == "UPI")
        check("booking CONFIRMED + ticket issued", booking(t1, b["id"])["status"] == "CONFIRMED"
              and call(BASE, "GET", f"/tickets/{b['id']}", token=t1)[0] == 200)
        check("replaying verify is idempotent (200)", verify(t1, b["id"], o, pid)[0] == 200)
        check("seat stays TAKEN", seat_status(sid, seat) == "TAKEN")

        print("\n== razorpay: not confirmed without a verified payment ==")
        b, seat = book(t1)
        o = order(t1, b["id"])
        pid = GW.pay(o["order_id"])
        st, _ = verify(t1, b["id"], o, pid, sig="0" * 64)
        check("forged signature rejected (400)", st == 400, st)
        check("booking still PENDING after forged signature", booking(t1, b["id"])["status"] == "PENDING")
        pid2 = GW.pay(o["order_id"], amount=100)
        st, _ = verify(t1, b["id"], o, pid2)
        check("amount mismatch rejected (400)", st == 400, st)
        pid3 = GW.pay(o["order_id"], status="failed")
        st, _ = verify(t1, b["id"], o, pid3)
        check("declined payment -> 402", st == 402, st)
        check("booking still PENDING (customer may retry until the deadline)", booking(t1, b["id"])["status"] == "PENDING")
        st, _ = call(BASE, "POST", f"/bookings/{b['id']}/pay/order", token=t2)
        check("another user cannot pay for my booking (403)", st == 403, st)

        print("\n== razorpay: customer cancels checkout ==")
        st, cb = call(BASE, "POST", f"/bookings/{b['id']}/pay/cancel", {"reason": "cancelled"}, t1)
        check("cancel -> booking CANCELLED", st == 200 and cb["status"] == "CANCELLED", (st, cb))
        check("cancel releases the seat", seat_status(sid, seat) == "AVAILABLE")
        with SessionLocal() as db:
            reason = db.execute(text("select failure_reason from payments where razorpay_order_id=:o"), {"o": o["order_id"]}).scalar()
        check("failure reason recorded", reason and "cancelled" in reason.lower(), reason)

        print("\n== razorpay: paid after the lock expired ==")
        b, seat = book(t1)
        o = order(t1, b["id"])
        pid = GW.pay(o["order_id"])
        expire(b["id"])
        call(BASE, "GET", f"/bookings/{b['id']}", token=t1)  # lazy expiry runs
        st, _ = verify(t1, b["id"], o, pid)
        check("seat still free -> late payment honoured (reinstated)", st == 200 and booking(t1, b["id"])["status"] == "CONFIRMED", st)

        b, seat = book(t1)
        o = order(t1, b["id"])
        pid = GW.pay(o["order_id"])
        expire(b["id"])
        call(BASE, "GET", f"/bookings/{b['id']}", token=t1)
        b2, _ = book(t2, seat)  # someone else grabs the freed seat
        st, body = verify(t1, b["id"], o, pid)
        check("seat taken meanwhile -> 409", st == 409, (st, body))
        check("late payment was refunded through the gateway", pid in GW.refunds)
        with SessionLocal() as db:
            ps = db.execute(text("select payment_status from payments where razorpay_order_id=:o"), {"o": o["order_id"]}).scalar()
        check("payment marked REFUNDED", ps == "REFUNDED", ps)
        check("original booking stays EXPIRED", booking(t1, b["id"])["status"] == "EXPIRED")
        check("the other user's booking is untouched", booking(t2, b2["id"])["status"] == "PENDING")

        print("\n== razorpay: webhook safety net ==")
        b, seat = book(t1)
        o = order(t1, b["id"])
        pid = GW.pay(o["order_id"], method="card")
        import json as _json
        body = _json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": GW.payments[pid]}}}).encode()
        import urllib.request
        def hook(sig):
            req = urllib.request.Request(BASE + "/payments/razorpay/webhook", data=body, method="POST",
                                         headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req) as r:
                    return r.status
            except urllib.error.HTTPError as e:
                return e.code
        check("webhook with a bad signature rejected (400)", hook("bad") == 400)
        good = rz._hmac_hex(os.environ["RAZORPAY_WEBHOOK_SECRET"], body)
        check("valid webhook accepted (200)", hook(good) == 200)
        check("browser never reported back, yet booking is CONFIRMED", booking(t1, b["id"])["status"] == "CONFIRMED")
        check("webhook replay is harmless", hook(good) == 200 and booking(t1, b["id"])["status"] == "CONFIRMED")
        check("verify after webhook is idempotent", verify(t1, b["id"], o, pid)[0] == 200)

        print("\n== razorpay: interrupted payment (tab closed after paying, no webhook) ==")
        def reconcile(token, booking_id):
            return call(BASE, "POST", f"/bookings/{booking_id}/pay/reconcile", token=token)

        b, seat = book(t1)
        o = order(t1, b["id"])
        check("nothing paid yet -> reconcile changes nothing", reconcile(t1, b["id"])[1]["status"] == "PENDING")
        pid = GW.pay(o["order_id"])  # customer paid, browser never reported back
        st, rb = reconcile(t1, b["id"])
        check("reconcile finds the payment and confirms the booking", st == 200 and rb["status"] == "CONFIRMED", rb.get("status"))
        check("a ticket exists", call(BASE, "GET", f"/tickets/{b['id']}", token=t1)[0] == 200)
        check("reconcile again is idempotent", reconcile(t1, b["id"])[1]["status"] == "CONFIRMED")

        b, seat = book(t1)
        o = order(t1, b["id"])
        pid = GW.pay(o["order_id"])
        expire(b["id"])
        call(BASE, "GET", f"/bookings/{b['id']}", token=t1)  # lock lapses
        st, rb = reconcile(t1, b["id"])
        check("paid just after expiry, seat free -> honoured", rb["status"] == "CONFIRMED", rb.get("status"))

        b, seat = book(t1)
        o = order(t1, b["id"])
        pid = GW.pay(o["order_id"])
        expire(b["id"])
        call(BASE, "GET", f"/bookings/{b['id']}", token=t1)
        book(t2, seat)  # seat re-sold
        st, rb = reconcile(t1, b["id"])
        check("paid after expiry, seat re-sold -> refunded, booking stays EXPIRED", rb["status"] == "EXPIRED" and pid in GW.refunds, (rb.get("status"), GW.refunds))

    # tidy: release everything the check created
    sql("UPDATE booking_seats SET status='CANCELLED' WHERE status IN ('RESERVED','CONFIRMED') AND booking_id IN "
        "(SELECT b.id FROM bookings b JOIN users u ON u.id=b.user_id WHERE u.email LIKE 'race%@railease.test')")
    sql("UPDATE bookings SET status='CANCELLED' WHERE status IN ('PENDING','CONFIRMED') AND user_id IN "
        "(SELECT id FROM users WHERE email LIKE 'race%@railease.test')")

    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
