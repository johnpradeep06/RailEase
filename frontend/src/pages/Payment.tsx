import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type {
  BookingOut,
  PaymentConfig,
  PaymentMethod,
  PaymentOrder,
  ScheduleDetail,
} from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { useBooking } from "../booking/BookingContext";
import { Alert, Button, Spinner } from "../components/ui";
import Stepper from "../components/Stepper";
import { inr } from "../lib/format";
import { loadRazorpay, type RazorpaySuccess } from "../lib/razorpay";
import { useCountdown } from "../lib/useCountdown";

type Phase = "ready" | "opening" | "checkout" | "verifying" | "paid" | "verify-error";
type Released = "cancelled" | "failed" | "expired" | "late" | "user";

const MOCK_METHODS: { id: PaymentMethod; label: string; sub: string }[] = [
  { id: "UPI", label: "UPI", sub: "GPay, PhonePe, Paytm" },
  { id: "CARD", label: "Debit / credit card", sub: "Visa, Mastercard, RuPay" },
  { id: "NET_BANKING", label: "Net banking", sub: "All major banks" },
  { id: "WALLET", label: "Wallet", sub: "Prepaid balance" },
];

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function Payment() {
  const { bookingId = "" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { draft, patch } = useBooking();

  const [booking, setBooking] = useState<BookingOut | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [released, setReleased] = useState<{ why: Released; detail?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mockMethod, setMockMethod] = useState<PaymentMethod>("UPI");

  const settled = useRef(false); // checkout finished one way or another
  const lastFailure = useRef<string | null>(null); // last payment.failed reason
  const [retry, setRetry] = useState<RazorpaySuccess | null>(null); // for "retry confirmation"

  const pending = booking?.status === "PENDING";
  const { label, secs, expired } = useCountdown(pending ? booking?.expires_at : null);

  const refreshBooking = useCallback(async () => {
    const b = await api.booking(bookingId);
    setBooking(b);
    return b;
  }, [bookingId]);

  // initial load
  useEffect(() => {
    Promise.all([api.booking(bookingId), api.paymentConfig()])
      .then(async ([first, c]) => {
        let b = first;
        // Paid but the browser never reported back (closed tab, dropped connection)?
        // Ask Razorpay; this confirms, honours or refunds the payment as needed.
        if (c.provider === "razorpay" && (b.status === "PENDING" || b.status === "EXPIRED")) {
          try {
            b = await api.reconcilePayment(b.id);
          } catch {
            /* keep what we already know */
          }
        }
        setConfig(c);
        setBooking(b);
        if (b.status === "CONFIRMED") nav(`/confirmation/${b.id}`, { replace: true });
        else if (b.status === "EXPIRED") setReleased({ why: "expired" });
        else if (b.status === "CANCELLED") setReleased({ why: "cancelled" });
        api.schedule(b.schedule_id).then(setSchedule).catch(() => {});
      })
      .catch((e) => setErr(msg(e, "Could not load this booking")));
  }, [bookingId, nav]);

  // the lock ran out while the page was open
  useEffect(() => {
    if (!expired || !pending || phase === "verifying" || phase === "paid") return;
    refreshBooking()
      .then((b) => {
        if (b.status === "EXPIRED") setReleased({ why: "expired" });
        if (b.status === "CONFIRMED") setPhase("paid");
      })
      .catch(() => {});
  }, [expired, pending, phase, refreshBooking]);

  const onPaid = () => {
    patch({ booking: null }); // don't let a stale draft ever cancel a paid booking
    setPhase("paid");
  };

  async function handleVerify(resp: RazorpaySuccess) {
    setRetry(null);
    setErr(null);
    setPhase("verifying");
    try {
      await api.verifyPayment(bookingId, resp);
      onPaid();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // paid after the lock lapsed and the seats were gone -> refunded
        setReleased({ why: "late", detail: e.message });
        setPhase("ready");
      } else {
        setErr(
          msg(e, "We could not confirm your payment yet.") +
            " Your payment was received by Razorpay — please retry instead of paying again.",
        );
        setRetry(resp);
        setPhase("verify-error");
      }
    }
  }

  async function handleDismiss() {
    if (settled.current) return;
    settled.current = true;
    const failure = lastFailure.current;
    try {
      const b = await api.cancelPayment(bookingId, failure ? "failed" : "cancelled", failure ?? undefined);
      if (b.status === "CONFIRMED") return onPaid(); // webhook beat us to it
    } catch {
      /* the lock still expires on its own */
    }
    setReleased({ why: failure ? "failed" : "cancelled", detail: failure ?? undefined });
    setPhase("ready");
  }

  async function payWithRazorpay() {
    setErr(null);
    setPhase("opening");
    if (!(await loadRazorpay())) {
      setErr("Could not load Razorpay Checkout. Check your connection and try again.");
      setPhase("ready");
      return;
    }
    let order: PaymentOrder;
    try {
      order = await api.createPaymentOrder(bookingId);
    } catch (e) {
      setErr(msg(e, "Could not start the payment"));
      setPhase("ready");
      refreshBooking().then((b) => b.status === "EXPIRED" && setReleased({ why: "expired" })).catch(() => {});
      return;
    }
    settled.current = false;
    lastFailure.current = null;
    const rzp = new window.Razorpay!({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: "RailEase",
      description: `Booking ${order.booking_reference}`,
      order_id: order.order_id,
      prefill: { name: user?.name ?? "", email: user?.email ?? "", contact: user?.phone ?? "" },
      theme: { color: "#c9f24d" },
      modal: { confirm_close: true, ondismiss: () => void handleDismiss() },
      handler: (resp) => {
        settled.current = true;
        void handleVerify(resp);
      },
    });
    rzp.on("payment.failed", (r) => {
      lastFailure.current = r.error.description ?? r.error.reason ?? "Payment failed";
    });
    setPhase("checkout");
    rzp.open();

    // If Razorpay never shows its window (bad keys, blocked script…) neither
    // callback fires, so don't leave the customer stuck waiting.
    setTimeout(() => {
      if (settled.current) return;
      const box = document.querySelector<HTMLElement>(".razorpay-container");
      if (box && getComputedStyle(box).display === "none") {
        setErr(
          "The Razorpay window didn't open. Please try again — if it keeps happening, the server's Razorpay keys may be invalid.",
        );
        setPhase((p) => (p === "checkout" ? "ready" : p));
      }
    }, 8000);
  }

  async function payMock() {
    setErr(null);
    setPhase("verifying");
    try {
      await api.pay(bookingId, mockMethod);
      onPaid();
    } catch (e) {
      setErr(msg(e, "Payment failed"));
      setPhase("ready");
      refreshBooking().then((b) => b.status === "EXPIRED" && setReleased({ why: "expired" })).catch(() => {});
    }
  }

  async function cancelBooking() {
    if (!confirm("Release your seats and cancel this booking?")) return;
    try {
      await api.cancelBooking(bookingId);
    } catch {
      /* already settled */
    }
    setReleased({ why: "user" });
  }

  function chooseAgain() {
    nav(draft.result && draft.coachType ? "/seats" : "/book");
  }

  if (err && !booking) return <Alert>{err}</Alert>;
  if (!booking || !config) return <Spinner label="Loading your booking…" />;

  // ---------------------------------------------------------------- released
  if (released) {
    const copy: Record<Released, { title: string; body: string }> = {
      cancelled: {
        title: "Payment cancelled",
        body: "You closed the payment window, so your seats were released for other travellers.",
      },
      failed: {
        title: "Payment failed",
        body: `${released.detail ?? "The payment did not go through"}. Your seats were released.`,
      },
      expired: {
        title: "Seat lock expired",
        body: `Payment wasn't completed within ${config.seat_lock_minutes} minutes, so your seats were released.`,
      },
      late: { title: "Payment received too late", body: released.detail ?? "" },
      user: { title: "Booking cancelled", body: "Your seats were released." },
    };
    const c = copy[released.why];
    return (
      <div>
        <Stepper current={5} />
        <div className="card mx-auto max-w-md p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-black/[0.06] text-2xl">
            ⏱
          </span>
          <h1 className="mt-4 text-2xl font-bold">{c.title}</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{c.body}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={chooseAgain}>Choose seats again</Button>
            <Button variant="ghost" onClick={() => nav("/trips")}>
              My trips
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------- payable
  const busy = phase === "opening" || phase === "verifying";
  const urgent = secs !== null && secs <= 120;
  const critical = secs !== null && secs <= 30;
  const isRazorpay = config.provider === "razorpay";
  const train = schedule?.train.name ?? draft.result?.train.name ?? "Your booking";

  return (
    <div>
      <Stepper current={5} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {booking.expires_at && (
            <div
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                critical
                  ? "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10"
                  : urgent
                    ? "border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10"
                    : "border-[var(--color-line)] bg-[var(--color-accent-soft)]"
              }`}
            >
              <div>
                <div className="text-sm font-semibold">Your seats are held for you</div>
                <div className="text-xs text-[var(--color-muted)]">
                  Pay before the timer ends or they go back on sale.
                </div>
              </div>
              <div className="font-display text-3xl font-bold tabular-nums">{label}</div>
            </div>
          )}

          <div className="card p-5 sm:p-6">
            {isRazorpay ? (
              <>
                <h1 className="text-xl font-bold">Pay securely with Razorpay</h1>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Pick a payment method inside the secure Razorpay window.
                </p>
                <div className="mt-4 rounded-xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface-2)] p-4 text-sm">
                  <div className="font-semibold">Test mode — no real money is charged</div>
                  <ul className="mt-1.5 space-y-0.5 text-[var(--color-muted)]">
                    <li>
                      Test card <code>5267 3181 8797 5449</code> · any future expiry · any CVV
                    </li>
                    <li>When the bank page asks for an OTP, enter any 6 digits.</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">How would you like to pay?</h1>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Demo gateway — any method completes instantly.
                </p>
                <div className="mt-5 space-y-3">
                  {MOCK_METHODS.map((m) => (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                        mockMethod === m.id
                          ? "border-[var(--color-ink)] bg-[var(--color-surface-2)]"
                          : "border-[var(--color-line-strong)] hover:border-[var(--color-ink)]/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="method"
                        className="h-4 w-4 accent-[var(--color-ink)]"
                        checked={mockMethod === m.id}
                        onChange={() => setMockMethod(m.id)}
                      />
                      <span>
                        <span className="block font-semibold">{m.label}</span>
                        <span className="block text-sm text-[var(--color-muted)]">{m.sub}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {err && (
              <div className="mt-4">
                <Alert>{err}</Alert>
              </div>
            )}
            {phase === "verify-error" && retry && (
              <Button className="mt-4" onClick={() => void handleVerify(retry)}>
                Retry confirmation
              </Button>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="font-bold">{train}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Ref {booking.booking_reference} · {booking.passengers.length} passenger
              {booking.passengers.length > 1 ? "s" : ""}
            </p>
            <div className="mt-4 space-y-1.5 text-sm">
              {booking.booking_seats.map((bs) => (
                <div key={bs.id} className="flex justify-between">
                  <span>{bs.seat.seat_number}</span>
                  <span>{inr(bs.fare)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-4">
              <span className="font-semibold">Total payable</span>
              <span className="text-xl font-bold">{inr(booking.total_amount)}</span>
            </div>
            <Button
              className="mt-4 w-full"
              disabled={busy || phase === "checkout" || phase === "verify-error" || expired}
              onClick={isRazorpay ? payWithRazorpay : payMock}
            >
              {phase === "opening"
                ? "Opening Razorpay…"
                : phase === "verifying"
                  ? "Confirming payment…"
                  : phase === "checkout"
                    ? "Waiting for Razorpay…"
                    : `Pay ${inr(booking.total_amount)}`}
            </Button>
            <button
              onClick={cancelBooking}
              disabled={busy}
              className="mt-3 w-full text-center text-sm text-[var(--color-muted)] underline hover:text-[var(--color-ink)] disabled:opacity-40"
            >
              Cancel & release seats
            </button>
          </div>
        </div>
      </div>

      {phase === "paid" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="card w-full max-w-sm p-8 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--color-accent)] text-3xl">
              ✓
            </span>
            <h2 className="mt-4 text-2xl font-bold">Payment successful</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {inr(booking.total_amount)} paid{isRazorpay ? " via Razorpay" : ""}.
            </p>
            <div className="mt-4 rounded-xl border border-[var(--color-line)] px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-[var(--color-muted)]">
                Booking ref
              </span>
              <div className="text-lg font-bold tracking-wider">{booking.booking_reference}</div>
            </div>
            <Button className="mt-5 w-full" onClick={() => nav(`/confirmation/${booking.id}`)}>
              View ticket
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
