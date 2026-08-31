import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { PaymentMethod } from "../lib/types";
import { useBooking } from "../booking/BookingContext";
import { Alert, Button } from "../components/ui";
import Stepper from "../components/Stepper";
import { inr } from "../lib/format";

const METHODS: { id: PaymentMethod; label: string; sub: string }[] = [
  { id: "UPI", label: "UPI", sub: "GPay, PhonePe, Paytm" },
  { id: "CARD", label: "Debit / credit card", sub: "Visa, Mastercard, RuPay" },
  { id: "NET_BANKING", label: "Net banking", sub: "All major banks" },
  { id: "WALLET", label: "Wallet", sub: "Prepaid balance" },
];

export default function Payment() {
  const nav = useNavigate();
  const { draft } = useBooking();
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const b = draft.booking;

  useEffect(() => {
    if (!b && !done) nav("/");
  }, [b, done, nav]);
  if (!b) return null;

  async function pay() {
    setErr(null);
    setBusy(true);
    try {
      const p = await api.pay(b!.id, method);
      if (p.payment_status !== "SUCCESS") {
        setErr(`Payment ${p.payment_status.toLowerCase()}. Try another method.`);
        return;
      }
      setDone(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Stepper current={5} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="card p-5 sm:p-6">
          <h1 className="text-xl font-bold">How would you like to pay?</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Demo gateway — any method completes instantly.
          </p>
          <div className="mt-5 space-y-3">
            {METHODS.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                  method === m.id
                    ? "border-[var(--color-ink)] bg-[var(--color-surface-2)]"
                    : "border-[var(--color-line-strong)] hover:border-[var(--color-ink)]/40"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  className="h-4 w-4 accent-[var(--color-ink)]"
                  checked={method === m.id}
                  onChange={() => setMethod(m.id)}
                />
                <span>
                  <span className="block font-semibold">{m.label}</span>
                  <span className="block text-sm text-[var(--color-muted)]">
                    {m.sub}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {err && (
            <div className="mt-4">
              <Alert>{err}</Alert>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="font-bold">
              {draft.result?.train.name ?? "Your booking"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Ref {b.booking_reference} · {b.passengers.length} passenger
              {b.passengers.length > 1 ? "s" : ""}
            </p>
            <div className="mt-4 space-y-1.5 text-sm">
              {b.booking_seats.map((bs) => (
                <div key={bs.id} className="flex justify-between">
                  <span>{bs.seat.seat_number}</span>
                  <span>{inr(bs.fare)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-4">
              <span className="font-semibold">Total payable</span>
              <span className="text-xl font-bold">{inr(b.total_amount)}</span>
            </div>
            <Button className="mt-4 w-full" disabled={busy} onClick={pay}>
              {busy ? "Processing…" : `Pay ${inr(b.total_amount)}`}
            </Button>
            <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
              🔒 A pending booking holds your seats until you pay or cancel.
            </p>
          </div>
        </div>
      </div>

      {done && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="card w-full max-w-sm p-8 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--color-accent)] text-3xl">
              ✓
            </span>
            <h2 className="mt-4 text-2xl font-bold">Payment successful</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {inr(b.total_amount)} paid via {method.replace("_", " ")}.
            </p>
            <div className="mt-4 rounded-xl border border-[var(--color-line)] px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-[var(--color-muted)]">
                Booking ref
              </span>
              <div className="text-lg font-bold tracking-wider">
                {b.booking_reference}
              </div>
            </div>
            <Button
              className="mt-5 w-full"
              onClick={() => nav(`/confirmation/${b.id}`)}
            >
              View ticket
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
