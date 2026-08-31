import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { BookingOut, FeedbackOut, ScheduleDetail, TicketOut } from "../../lib/types";
import { Alert, Button } from "../../components/ui";
import TicketCard from "../../components/TicketCard";

function Bookings() {
  const [id, setId] = useState("");
  const [booking, setBooking] = useState<BookingOut | null>(null);
  const [ticket, setTicket] = useState<TicketOut | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBooking(null);
    setTicket(null);
    setSchedule(null);
    try {
      const b = await api.booking(id.trim());
      setBooking(b);
      const [t, s] = await Promise.allSettled([
        api.ticket(b.id),
        api.schedule(b.schedule_id),
      ]);
      if (t.status === "fulfilled") setTicket(t.value);
      if (s.status === "fulfilled") setSchedule(s.value);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Booking not found");
    }
  }

  async function cancel() {
    if (!booking || !confirm("Cancel this booking? Seats are released.")) return;
    setBusy(true);
    try {
      setBooking(await api.cancelBooking(booking.id));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="font-bold">Look up a booking</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        The API has no browse-all-bookings endpoint. Admins can fetch and cancel
        any booking by its id.
      </p>
      <form onSubmit={find} className="mt-3 flex gap-2">
        <input
          className="field"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="booking uuid"
        />
        <Button type="submit" variant="ghost">
          Find
        </Button>
      </form>
      {err && (
        <div className="mt-4">
          <Alert>{err}</Alert>
        </div>
      )}
      {booking && (
        <div className="mt-4 space-y-3">
          <TicketCard booking={booking} ticket={ticket} schedule={schedule} />
          {booking.status !== "CANCELLED" && (
            <Button variant="ghost" disabled={busy} onClick={cancel}>
              {busy ? "Cancelling…" : "Cancel this booking"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const STATUSES: FeedbackOut["status"][] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

function Feedback() {
  const [id, setId] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<FeedbackOut["status"]>("RESOLVED");
  const [result, setResult] = useState<FeedbackOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    setBusy(true);
    try {
      const f = await api.adminRespondFeedback(id.trim(), {
        admin_response: text.trim(),
        status,
      });
      setResult(f);
      setText("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to respond");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6">
      <h2 className="font-bold">Respond to feedback</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        The API exposes only <code>PUT /feedback/&#123;id&#125;/respond</code> —
        there's no list-all, so paste the feedback id (from the customer or the
        DB).
      </p>
      <div className="mt-3 space-y-3">
        <input
          className="field"
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="feedback uuid"
        />
        <textarea
          className="field min-h-24"
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Response to the traveller…"
        />
        <label>
          <span className="label">Set status to</span>
          <select
            className="field"
            value={status}
            onChange={(e) => setStatus(e.target.value as FeedbackOut["status"])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {err && <Alert>{err}</Alert>}
        {result && (
          <Alert tone="info">
            Updated — feedback is now <b>{result.status}</b>.
          </Alert>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Send response"}
        </Button>
      </div>
    </form>
  );
}

export default function AdminOps() {
  return (
    <div className="space-y-6">
      <Bookings />
      <Feedback />
    </div>
  );
}
