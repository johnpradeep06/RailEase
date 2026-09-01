import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { BookingOut, ScheduleDetail, Station } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { useBooking } from "../booking/BookingContext";
import {
  getRecentSearches,
  greeting,
  pushRecentSearch,
  type RecentSearch,
} from "../lib/personalization";
import { Button, Pill } from "../components/ui";
import heroSectionImg from "../assets/login.png";
import bengaluruImg from "../assets/places/bengaluru.jpg";
import chennaiImg from "../assets/places/chennai.png";
import delhiImg from "../assets/places/delhi.jpg";
import mumbaiImg from "../assets/places/mumbai.jpg";
import { dayMonth, hhmm, inr } from "../lib/format";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const DESTINATIONS = [
  { code: "BCT", city: "Mumbai", tag: "Coastal capital", image: mumbaiImg },
  { code: "MAS", city: "Chennai", tag: "Gateway to the south", image: chennaiImg },
  { code: "SBC", city: "Bengaluru", tag: "Garden city", image: bengaluruImg },
  { code: "NDLS", city: "New Delhi", tag: "The heart of it all", image: delhiImg },
];

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { reset, patch } = useBooking();

  const [stations, setStations] = useState<Station[]>([]);
  const [bookings, setBookings] = useState<BookingOut[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ScheduleDetail>>({});
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  const [src, setSrc] = useState("");
  const [dst, setDst] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    setRecent(getRecentSearches());
    api.stations().then(setStations).catch(() => { });
    api
      .myBookings()
      .then(async (bs) => {
        setBookings(bs);
        const ids = [...new Set(bs.map((b) => b.schedule_id))].slice(0, 8);
        const res = await Promise.allSettled(ids.map((id) => api.schedule(id)));
        const map: Record<string, ScheduleDetail> = {};
        res.forEach((r, i) => {
          if (r.status === "fulfilled") map[ids[i]] = r.value;
        });
        setSchedules(map);
      })
      .catch(() => { });
  }, []);

  const nextTrip = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => b.status === "CONFIRMED" || b.status === "PENDING")
      .map((b) => ({ b, s: schedules[b.schedule_id] }))
      .filter((x) => x.s && new Date(x.s.departure_time).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.s!.departure_time).getTime() -
          new Date(b.s!.departure_time).getTime(),
      )[0];
  }, [bookings, schedules]);

  function runSearch(source: string, destination: string, d: string) {
    if (!source || !destination || source === destination || !d) return;
    reset();
    patch({ search: { source, destination, date: d } });
    pushRecentSearch({ source, destination, date: d });
    nav("/results");
  }

  const nameFor = (code: string) =>
    stations.find((s) => s.station_code === code)?.city ||
    stations.find((s) => s.station_code === code)?.name ||
    code;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="overflow-hidden rounded-[1.75rem] bg-[var(--color-dark)] text-white">
        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-white/60">{greeting(user?.name)}</p>
            <h1 className="mt-2 text-4xl font-bold leading-[1.05] sm:text-5xl">
              Plan your
              <br />
              <span className="text-[var(--color-accent)]">journey.</span>
            </h1>
            <p className="mt-4 max-w-sm text-white/70">
              Search live schedules, choose your exact berth on a seat map, and
              pay — one clean flow, on any device.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(src, dst, date);
              }}
              className="mt-6 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10 backdrop-blur"
            >
              <div className="grid gap-2.5 sm:grid-cols-2">
                <select
                  className="field [color-scheme:light]"
                  value={src}
                  onChange={(e) => setSrc(e.target.value)}
                >
                  <option value="">From</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.station_code}>
                      {s.name} ({s.station_code})
                    </option>
                  ))}
                </select>
                <select
                  className="field [color-scheme:light]"
                  value={dst}
                  onChange={(e) => setDst(e.target.value)}
                >
                  <option value="">To</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.station_code}>
                      {s.name} ({s.station_code})
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  min={todayStr()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="field [color-scheme:light]"
                />
                <Button type="submit" className="w-full">
                  Search trains →
                </Button>
              </div>
            </form>

            {recent.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/50">Recent</span>
                {recent.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => runSearch(r.source, r.destination, r.date)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85 hover:bg-white/20"
                  >
                    {r.source} → {r.destination}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="hidden lg:block">
            <img
              src={heroSectionImg}
              alt="RailEase Hero"
              className="w-full h-auto rounded-2xl object-contain"
            />
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <QuickAction to="/book" title="Book tickets" desc="Search & reserve seats" primary />
        <QuickAction to="/trips" title="My trips" desc="Tickets & PNR" />
        <QuickAction to="/feedback" title="Feedback" desc="Tell us how it went" />
        <QuickAction to="/account" title="Account" desc="Profile & sign-in" />
      </section>

      {/* Next trip */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Your next trip</h2>
          <Link to="/trips" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            See all
          </Link>
        </div>
        {nextTrip ? (
          <Link to={`/trips/${nextTrip.b.id}`} className="card card-interactive block p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{nextTrip.s!.train.name}</span>
                  <Pill tone={nextTrip.b.status === "CONFIRMED" ? "ok" : "warn"}>
                    {nextTrip.b.status}
                  </Pill>
                </div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">
                  {hhmm(nextTrip.s!.departure_time)} · {dayMonth(nextTrip.s!.departure_time)} ·{" "}
                  {nextTrip.b.booking_seats.length} seat
                  {nextTrip.b.booking_seats.length > 1 ? "s" : ""} · Ref{" "}
                  {nextTrip.b.booking_reference}
                </div>
              </div>
              <span className="text-lg font-bold">{inr(nextTrip.b.total_amount)}</span>
            </div>
          </Link>
        ) : (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <span className="text-sm text-[var(--color-muted)]">
              No upcoming trips yet — your booked journeys show up here.
            </span>
            <Link to="/book">
              <Button size="sm">Book a train</Button>
            </Link>
          </div>
        )}
      </section>

      {/* Explore */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Explore routes</h2>
          <span className="text-sm text-[var(--color-muted)]">Tap to start a search</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {DESTINATIONS.map((d) => (
            <button
              key={d.code}
              onClick={() => {
                setDst(d.code);
                runSearch("NDLS", d.code, date || todayStr());
              }}
              className="card card-interactive overflow-hidden text-left"
            >
              <img
                src={d.image}
                alt={`${d.city} photo`}
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="p-4">
                <div className="font-bold">{nameFor(d.code)}</div>
                <div className="text-xs text-[var(--color-muted)]">{d.tag}</div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  to,
  title,
  desc,
  primary = false,
}: {
  to: string;
  title: string;
  desc: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`card-interactive rounded-[1.25rem] border p-4 sm:p-5 ${primary
        ? "border-transparent bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
        : "border-[var(--color-line)] bg-[var(--color-surface)]"
        }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-lg">
        {primary ? "🎫" : "→"}
      </div>
      <div className="mt-3 font-bold">{title}</div>
      <div
        className={`text-xs ${primary ? "text-[var(--color-accent-ink)]/70" : "text-[var(--color-muted)]"}`}
      >
        {desc}
      </div>
    </Link>
  );
}
