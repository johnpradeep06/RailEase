import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Station } from "../lib/types";
import { useBooking } from "../booking/BookingContext";
import {
  getRecentSearches,
  pushRecentSearch,
  type RecentSearch,
} from "../lib/personalization";
import { Alert, Button, Spinner } from "../components/ui";
import ImagePlaceholder from "../components/ImagePlaceholder";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STEPS = [
  ["Route & date", "Where you're going and when."],
  ["Pick a class", "Sleeper, 3AC, chair car — with live availability."],
  ["Coach → bay → seat", "Drill into a live map and tap your exact berth."],
  ["Passengers & pay", "Add travellers, pay, get your ticket."],
];

export default function Search() {
  const nav = useNavigate();
  const { draft, patch, reset } = useBooking();
  const [stations, setStations] = useState<Station[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [source, setSource] = useState(draft.search?.source ?? "");
  const [dest, setDest] = useState(draft.search?.destination ?? "");
  const [date, setDate] = useState(draft.search?.date ?? "");

  useEffect(() => {
    setRecent(getRecentSearches());
    api.stations().then(setStations).catch((e) => setErr(e.message));
  }, []);

  function go(s: string, d: string, dt: string) {
    if (!s || !d || !dt) return;
    if (s === d) {
      setErr("Source and destination must be different");
      return;
    }
    reset();
    patch({ search: { source: s, destination: d, date: dt } });
    pushRecentSearch({ source: s, destination: d, date: dt });
    nav("/results");
  }

  function swap() {
    setSource(dest);
    setDest(source);
  }

  if (!stations && !err) return <Spinner label="Loading stations…" />;

  const stationOpts = (
    <>
      <option value="">Select station</option>
      {stations?.map((s) => (
        <option key={s.id} value={s.station_code}>
          {s.name} ({s.station_code}){s.city ? ` · ${s.city}` : ""}
        </option>
      ))}
    </>
  );

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">Book a train</h1>
        <p className="mt-2 max-w-md text-[var(--color-muted)]">
          Pick a route and date. Next you'll choose a class, then your exact
          seat on a live map.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(source, dest, date);
          }}
          className="card mt-6 p-5 sm:p-6"
        >
          {err && (
            <div className="mb-4">
              <Alert>{err}</Alert>
            </div>
          )}

          {/* From / swap / To — stacked so long station names have room */}
          <div className="relative rounded-2xl border border-[var(--color-line)] p-3">
            <label className="block">
              <span className="label">From</span>
              <select
                className="field"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                required
              >
                {stationOpts}
              </select>
            </label>

            <div className="relative my-1 flex h-0 justify-center">
              <button
                type="button"
                onClick={swap}
                aria-label="Swap stations"
                className="absolute -top-4 grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-sm transition hover:rotate-180 hover:bg-black/[0.04]"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M7 4L4 7l3 3M4 7h9M13 16l3-3-3-3M16 13H7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <label className="block pt-2">
              <span className="label">To</span>
              <select
                className="field"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                required
              >
                {stationOpts}
              </select>
            </label>
          </div>

          <label className="mt-3 block">
            <span className="label">Journey date</span>
            <input
              type="date"
              className="field [color-scheme:light]"
              min={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          <Button type="submit" className="mt-4 w-full">
            Search trains →
          </Button>
        </form>

        {recent.length > 0 && (
          <div className="mt-5">
            <span className="label">Recent searches</span>
            <div className="flex flex-wrap gap-2">
              {recent.map((r, i) => (
                <button
                  key={i}
                  onClick={() => go(r.source, r.destination, r.date)}
                  className="chip hover:bg-black/10"
                >
                  {r.source}
                  <span className="text-[var(--color-muted)]">→</span>
                  {r.destination}
                  <span className="text-[var(--color-muted)]">
                    ·{" "}
                    {new Date(r.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right rail — how it works */}
      <aside className="hidden lg:block">
        <div className="card overflow-hidden">
          <ImagePlaceholder label="Booking illustration" aspect="16/11" rounded="rounded-none" />
          <div className="p-5">
            <h2 className="font-bold">How booking works</h2>
            <ol className="mt-3 space-y-3">
              {STEPS.map(([title, desc], i) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-ink)] text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {desc}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>
    </div>
  );
}
