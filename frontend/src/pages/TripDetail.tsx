import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { BookingOut, ScheduleDetail, TicketOut } from "../lib/types";
import { Alert, Button, Spinner } from "../components/ui";
import TicketCard from "../components/TicketCard";

export default function TripDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [booking, setBooking] = useState<BookingOut | null>(null);
  const [ticket, setTicket] = useState<TicketOut | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const b = await api.booking(id);
      setBooking(b);
      const [t, s] = await Promise.allSettled([
        api.ticket(b.id),
        api.schedule(b.schedule_id),
      ]);
      setTicket(t.status === "fulfilled" ? t.value : null);
      if (s.status === "fulfilled") setSchedule(s.value);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cancel() {
    if (!booking || !confirm("Cancel this booking? Seats will be released."))
      return;
    setBusy(true);
    try {
      await api.cancelBooking(booking.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (err) return <Alert>{err}</Alert>;
  if (!booking) return <Spinner />;

  return (
    <div className="mx-auto max-w-xl">
      <button
        onClick={() => nav("/trips")}
        className="mb-4 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        ← All trips
      </button>
      <TicketCard booking={booking} ticket={ticket} schedule={schedule} />
      <div className="mt-6 flex justify-between">
        <Link to="/feedback">
          <Button variant="ghost">Leave feedback</Button>
        </Link>
        {booking.status !== "CANCELLED" && (
          <Button variant="ghost" disabled={busy} onClick={cancel}>
            {busy ? "Cancelling…" : "Cancel booking"}
          </Button>
        )}
      </div>
    </div>
  );
}
