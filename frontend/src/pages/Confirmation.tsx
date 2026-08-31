import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { BookingOut, ScheduleDetail, TicketOut } from "../lib/types";
import { Alert, Button, Pill, Spinner } from "../components/ui";
import Stepper from "../components/Stepper";
import TicketCard from "../components/TicketCard";

export default function Confirmation() {
  const { bookingId = "" } = useParams();
  const [booking, setBooking] = useState<BookingOut | null>(null);
  const [ticket, setTicket] = useState<TicketOut | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .booking(bookingId)
      .then(async (b) => {
        setBooking(b);
        const [t, s] = await Promise.allSettled([
          api.ticket(b.id),
          api.schedule(b.schedule_id),
        ]);
        if (t.status === "fulfilled") setTicket(t.value);
        if (s.status === "fulfilled") setSchedule(s.value);
      })
      .catch((e) => setErr(e.message));
  }, [bookingId]);

  if (err) return <Alert>{err}</Alert>;
  if (!booking) return <Spinner label="Loading ticket…" />;

  return (
    <div>
      <Stepper current={6} />
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--color-accent)] text-2xl">
          ✓
        </span>
        <h1 className="mt-4 text-3xl font-bold">You're booked</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Booking {booking.booking_reference}
          {ticket && (
            <>
              {" · "}
              <Pill tone={ticket.ticket_status === "ACTIVE" ? "ok" : "danger"}>
                {ticket.ticket_status}
              </Pill>
            </>
          )}
        </p>
      </div>

      <div className="mx-auto mt-6 max-w-xl">
        <TicketCard booking={booking} ticket={ticket} schedule={schedule} />
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/trips">
            <Button variant="dark">My trips</Button>
          </Link>
          <Link to="/">
            <Button variant="ghost">Book another</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
