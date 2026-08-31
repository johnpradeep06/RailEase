import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { BookingOut, FeedbackOut } from "../lib/types";
import { Alert, Button, Pill, Spinner } from "../components/ui";

export default function Feedback() {
  const [list, setList] = useState<FeedbackOut[] | null>(null);
  const [bookings, setBookings] = useState<BookingOut[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    rating: 5,
    subject: "",
    message: "",
    booking_id: "",
  });

  async function load() {
    const [f, b] = await Promise.allSettled([api.myFeedback(), api.myBookings()]);
    if (f.status === "fulfilled") setList(f.value);
    else setErr("Failed to load feedback");
    if (b.status === "fulfilled") setBookings(b.value);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.createFeedback({
        rating: form.rating,
        subject: form.subject || null,
        message: form.message,
        booking_id: form.booking_id || null,
      });
      setForm({ rating: 5, subject: "", message: "", booking_id: "" });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not send feedback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="card h-fit p-6">
        <h1 className="text-xl font-bold">Share feedback</h1>
        <div className="mt-5 space-y-4">
          <div>
            <span className="label">Rating</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rating: n }))}
                  className={`h-10 w-10 rounded-lg border text-lg ${
                    n <= form.rating
                      ? "border-[var(--color-accent-ink)] bg-[var(--color-accent)]"
                      : "border-[var(--color-line)]"
                  }`}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="label">About a trip (optional)</span>
            <select
              className="field"
              value={form.booking_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, booking_id: e.target.value }))
              }
            >
              <option value="">General feedback</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.booking_reference} · {b.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Subject (optional)</span>
            <input
              className="field"
              maxLength={200}
              value={form.subject}
              onChange={(e) =>
                setForm((f) => ({ ...f, subject: e.target.value }))
              }
            />
          </label>
          <label>
            <span className="label">Message</span>
            <textarea
              className="field min-h-28"
              required
              value={form.message}
              onChange={(e) =>
                setForm((f) => ({ ...f, message: e.target.value }))
              }
            />
          </label>
          {err && <Alert>{err}</Alert>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </form>

      <div>
        <h2 className="text-lg font-bold">Your feedback</h2>
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            Nothing submitted yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {list.map((f) => (
              <div key={f.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {"★".repeat(f.rating)}
                    <span className="text-[var(--color-line)]">
                      {"★".repeat(5 - f.rating)}
                    </span>
                    {f.subject && (
                      <span className="ml-2 font-normal">{f.subject}</span>
                    )}
                  </span>
                  <Pill
                    tone={
                      f.status === "RESOLVED" || f.status === "CLOSED"
                        ? "ok"
                        : "warn"
                    }
                  >
                    {f.status}
                  </Pill>
                </div>
                <p className="mt-2 text-sm">{f.message}</p>
                {f.admin_response && (
                  <p className="mt-3 rounded-lg bg-black/5 p-3 text-sm">
                    <b>Support:</b> {f.admin_response}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
