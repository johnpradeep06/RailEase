import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { CoachType, ScheduleSearchResult } from "../lib/types";
import { useBooking } from "../booking/BookingContext";
import { Alert, Button, EmptyState, Pill, Spinner } from "../components/ui";
import Stepper from "../components/Stepper";
import {
  COACH_LABEL,
  dayMonth,
  dayOffset,
  durationBetween,
  hhmm,
  inr,
} from "../lib/format";

interface ClassRow {
  coach_type: CoachType;
  base_fare: string;
  total: number;
  available: number;
}

function classRows(r: ScheduleSearchResult): ClassRow[] {
  const m = new Map<CoachType, ClassRow>();
  for (const c of r.coach_availability) {
    const row = m.get(c.coach_type) ?? {
      coach_type: c.coach_type,
      base_fare: c.base_fare,
      total: 0,
      available: 0,
    };
    row.total += c.total_seats;
    row.available += c.available_seats;
    m.set(c.coach_type, row);
  }
  const ORDER: CoachType[] = ["SL", "CC", "3AC", "2AC", "1AC"];
  return [...m.values()].sort(
    (a, b) => ORDER.indexOf(a.coach_type) - ORDER.indexOf(b.coach_type),
  );
}

function TrainCard({ r }: { r: ScheduleSearchResult }) {
  const nav = useNavigate();
  const { patch } = useBooking();
  const [picked, setPicked] = useState<CoachType | null>(null);
  const rows = classRows(r);
  const off = dayOffset(r.departure_time, r.arrival_time);

  function cont() {
    if (!picked) return;
    patch({ result: r, coachType: picked, seats: [] });
    nav("/seats");
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-5 py-3">
        <span className="font-bold">{r.train.name}</span>
        <span className="text-sm text-[var(--color-muted)]">
          {r.train.train_number}
        </span>
        {r.train.train_type && <Pill tone="accent">{r.train.train_type}</Pill>}
      </div>

      <div className="p-5">
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="text-center">
            <div className="font-display text-2xl font-bold sm:text-3xl">
              {hhmm(r.departure_time)}
            </div>
            <div className="text-xs text-[var(--color-muted)]">
              {dayMonth(r.departure_time)}
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[11px] font-medium text-[var(--color-muted)]">
              {durationBetween(r.departure_time, r.arrival_time)}
            </span>
            <div className="flex w-full items-center">
              <span className="h-2 w-2 rounded-full border-2 border-[var(--color-ink)]" />
              <span className="h-px flex-1 bg-[var(--color-line-strong)]" />
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--color-muted)]" fill="none">
                <path d="M4 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-2xl font-bold sm:text-3xl">
              {hhmm(r.arrival_time)}
              {off && <sup className="ml-0.5 text-xs text-[var(--color-muted)]">{off}</sup>}
            </div>
            <div className="text-xs text-[var(--color-muted)]">
              {dayMonth(r.arrival_time)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {rows.map((c) => {
            const sel = picked === c.coach_type;
            const soldOut = c.available <= 0;
            const low = !soldOut && c.available <= 8;
            return (
              <button
                key={c.coach_type}
                disabled={soldOut}
                onClick={() => setPicked(c.coach_type)}
                className={`rounded-xl border p-3 text-left transition ${
                  sel
                    ? "border-transparent bg-[var(--color-ink)] text-white"
                    : "border-[var(--color-line-strong)] hover:border-[var(--color-ink)]"
                } ${soldOut ? "opacity-45" : ""}`}
              >
                <div className="text-sm font-semibold">
                  {c.coach_type}
                  <span className={`ml-1 font-normal ${sel ? "text-white/55" : "text-[var(--color-muted)]"}`}>
                    {COACH_LABEL[c.coach_type]}
                  </span>
                </div>
                <div className={`mt-1 text-lg font-bold ${sel ? "text-[var(--color-accent)]" : ""}`}>
                  {inr(c.base_fare)}
                </div>
                <div
                  className={`mt-0.5 text-xs ${
                    sel
                      ? "text-white/70"
                      : soldOut
                        ? "text-[var(--color-danger)]"
                        : low
                          ? "text-[var(--color-warn)]"
                          : "text-[var(--color-ok)]"
                  }`}
                >
                  {soldOut
                    ? "Sold out"
                    : low
                      ? `Only ${c.available} left`
                      : `${c.available} of ${c.total} free`}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--color-muted)]">
            {picked ? `${picked} selected` : "Select a class"}
          </span>
          <Button variant="dark" disabled={!picked} onClick={cont}>
            Choose seats →
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Results() {
  const nav = useNavigate();
  const { draft } = useBooking();
  const [data, setData] = useState<ScheduleSearchResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!draft.search) {
      nav("/book");
      return;
    }
    const { source, destination, date } = draft.search;
    setData(null);
    api.search(source, destination, date).then(setData).catch((e) => setErr(e.message));
  }, [draft.search, nav]);

  if (!draft.search) return null;

  return (
    <div>
      <Stepper current={2} />
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold">
          {draft.search.source} <span className="text-[var(--color-muted)]">→</span>{" "}
          {draft.search.destination}
        </h1>
        <Pill>
          {new Date(draft.search.date).toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </Pill>
        <button
          onClick={() => nav("/book")}
          className="text-sm text-[var(--color-muted)] underline hover:text-[var(--color-ink)]"
        >
          Edit
        </button>
      </div>

      {err && <Alert>{err}</Alert>}
      {!data && !err && <Spinner label="Finding trains…" />}
      {data && data.length === 0 && (
        <EmptyState
          title="No trains on this route and date"
          sub="Try a different date — seeded schedules run on Mondays."
          action={
            <Button variant="ghost" onClick={() => nav("/book")}>
              Edit search
            </Button>
          }
        />
      )}
      <div className="space-y-4">
        {data?.map((r) => <TrainCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}
