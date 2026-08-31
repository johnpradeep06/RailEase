import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { BookingOut, ScheduleDetail } from "../lib/types";
import { Alert, Button, EmptyState, Pill, Spinner } from "../components/ui";
import { dayMonth, hhmm, inr } from "../lib/format";

type Filter = "all" | "upcoming" | "past" | "cancelled";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
];

export default function MyTrips() {
  const [bookings, setBookings] = useState<BookingOut[] | null>(null);
  const [schedules, setSchedules] = useState<Record<string, ScheduleDetail>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    try {
      const bs = await api.myBookings();
      setBookings(bs);
      const ids = [...new Set(bs.map((b) => b.schedule_id))];
      const details = await Promise.allSettled(ids.map((id) => api.schedule(id)));
      const map: Record<string, ScheduleDetail> = {};
      details.forEach((d, i) => {
        if (d.status === "fulfilled") map[ids[i]] = d.value;
      });
      setSchedules(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(id: string) {
    if (!confirm("Cancel this booking? Seats will be released.")) return;
    setBusyId(id);
    try {
      await api.cancelBooking(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  const shown = useMemo(() => {
    if (!bookings) return [];
    const now = Date.now();
    return bookings.filter((b) => {
      const dep = schedules[b.schedule_id]?.departure_time;
      const future = dep ? new Date(dep).getTime() > now : true;
      if (filter === "cancelled") return b.status === "CANCELLED";
      if (filter === "upcoming") return b.status !== "CANCELLED" && future;
      if (filter === "past") return b.status !== "CANCELLED" && !future;
      return true;
    });
  }, [bookings, schedules, filter]);

  if (err) return <Alert>{err}</Alert>;
  if (!bookings) return <Spinner label="Loading your trips…" />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My trips</h1>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                filter === f.id
                  ? "bg-[var(--color-ink)] text-white"
                  : "bg-black/[0.05] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={bookings.length === 0 ? "No bookings yet" : "Nothing here"}
            sub={
              bookings.length === 0
                ? "Your booked journeys will appear here."
                : "Try a different filter."
            }
            action={
              bookings.length === 0 ? (
                <Link to="/book">
                  <Button>Book a train</Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {shown.map((b) => {
            const s = schedules[b.schedule_id];
            const stops = s?.route.stops ?? [];
            const src = stops.find((x) => x.station.id === b.source_station_id);
            const dst = stops.find((x) => x.station.id === b.destination_station_id);
            return (
              <div key={b.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{s?.train.name ?? "Train"}</span>
                      <Pill
                        tone={
                          b.status === "CONFIRMED"
                            ? "ok"
                            : b.status === "CANCELLED"
                              ? "danger"
                              : "warn"
                        }
                      >
                        {b.status}
                      </Pill>
                    </div>
                    <div className="mt-1 text-sm text-[var(--color-muted)]">
                      {src && dst
                        ? `${src.station.station_code} → ${dst.station.station_code}`
                        : `Ref ${b.booking_reference}`}
                      {s && ` · ${hhmm(s.departure_time)} ${dayMonth(s.departure_time)}`}
                      {` · ${b.booking_seats.length} seat${b.booking_seats.length > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{inr(b.total_amount)}</div>
                    <div className="mt-2 flex gap-2">
                      <Link to={`/trips/${b.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                      {b.status !== "CANCELLED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === b.id}
                          onClick={() => cancel(b.id)}
                        >
                          {busyId === b.id ? "…" : "Cancel"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
