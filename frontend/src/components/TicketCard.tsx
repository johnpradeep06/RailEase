import type { BookingOut, ScheduleDetail, TicketOut } from "../lib/types";
import { Pill } from "./ui";
import { dayMonth, hhmm, inr } from "../lib/format";

export default function TicketCard({
  booking,
  ticket,
  schedule,
}: {
  booking: BookingOut;
  ticket: TicketOut | null;
  schedule: ScheduleDetail | null;
}) {
  const stops = schedule?.route.stops ?? [];
  const src = stops.find((s) => s.station.id === booking.source_station_id);
  const dst = stops.find((s) => s.station.id === booking.destination_station_id);
  const seatByPassenger = new Map(
    booking.booking_seats.map((bs) => [bs.passenger_id, bs]),
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between bg-[var(--color-ink)] px-5 py-3 text-white">
        <span className="font-display font-bold">
          {schedule?.train.name ?? "Train ticket"}
        </span>
        <span className="text-sm text-white/70">
          {schedule?.train.train_number}
        </span>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Info label="PNR / Ticket">
          {ticket?.ticket_number ?? "—"}
        </Info>
        <Info label="Booking ref">{booking.booking_reference}</Info>
        <Info label="From">
          {src ? `${src.station.name} (${src.station.station_code})` : "—"}
        </Info>
        <Info label="To">
          {dst ? `${dst.station.name} (${dst.station.station_code})` : "—"}
        </Info>
        {schedule && (
          <>
            <Info label="Departs">
              {hhmm(schedule.departure_time)} · {dayMonth(schedule.departure_time)}
            </Info>
            <Info label="Arrives">
              {hhmm(schedule.arrival_time)} · {dayMonth(schedule.arrival_time)}
            </Info>
          </>
        )}
        <Info label="Status">
          <Pill
            tone={
              booking.status === "CONFIRMED"
                ? "ok"
                : booking.status === "CANCELLED"
                  ? "danger"
                  : "warn"
            }
          >
            {booking.status}
          </Pill>
        </Info>
        <Info label="Total">{inr(booking.total_amount)}</Info>
      </div>

      <div className="border-t border-dashed border-[var(--color-line)] p-5">
        <span className="label">Passengers</span>
        <div className="mt-2 space-y-2">
          {booking.passengers.map((p) => {
            const bs = seatByPassenger.get(p.id);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
              >
                <span>
                  <b>{p.name}</b>{" "}
                  <span className="text-[var(--color-muted)]">
                    {p.gender.toLowerCase()}
                  </span>
                </span>
                <span className="text-right">
                  {bs ? (
                    <>
                      <b>{bs.seat.seat_number}</b>{" "}
                      <span className="text-[var(--color-muted)]">
                        {bs.seat.seat_type.replace("_", " ").toLowerCase()} ·{" "}
                        {bs.status.toLowerCase()}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="font-semibold">{children}</div>
    </div>
  );
}
