import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Gender, PassengerCreate } from "../lib/types";
import { useBooking } from "../booking/BookingContext";
import { Alert, Button } from "../components/ui";
import Stepper from "../components/Stepper";
import { inr } from "../lib/format";

const GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER"];

function blank(): PassengerCreate {
  return {
    name: "",
    date_of_birth: null,
    gender: "MALE",
    berth_preference: "NO_PREFERENCE",
    email: null,
    phone: null,
  };
}

function berthLabel(seatType: string): string {
  if (seatType === "SEAT") return "Chair-car seat";
  const s = seatType.replace("_", "-").toLowerCase();
  return `${s[0].toUpperCase()}${s.slice(1)} berth`;
}

export default function Passengers() {
  const nav = useNavigate();
  const { draft, patch } = useBooking();
  const [rows, setRows] = useState<PassengerCreate[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [staleSeats, setStale] = useState(false);
  const [busy, setBusy] = useState(false);

  const ready =
    draft.result &&
    draft.sourceStationId &&
    draft.destStationId &&
    draft.seats.length > 0;

  useEffect(() => {
    if (!ready) {
      nav("/seats");
      return;
    }
    setRows(draft.seats.map(blank));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;
  const totalFare = draft.seats.reduce((sum, s) => sum + Number(s.fare), 0);
  const coachCount = new Set(draft.seats.map((s) => s.coach_number)).size;

  function update(i: number, p: Partial<PassengerCreate>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...p } : row)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setStale(false);
    setBusy(true);
    try {
      const booking = await api.createBooking({
        schedule_id: draft.result!.id,
        source_station_id: draft.sourceStationId!,
        destination_station_id: draft.destStationId!,
        seat_ids: draft.seats.map((s) => s.id),
        passengers: rows.map((r, i) => {
          const st = draft.seats[i].seat_type;
          return {
            ...r,
            // The berth is fixed by the seat picked on the map, not chosen here.
            berth_preference: st === "SEAT" ? "NO_PREFERENCE" : st,
            date_of_birth: r.date_of_birth || null,
            email: r.email || null,
            phone: r.phone || null,
          };
        }),
      });
      patch({ booking });
      nav("/payment");
    } catch (e) {
      if (e instanceof ApiError && /no longer available/i.test(e.message))
        setStale(true);
      setErr(e instanceof ApiError ? e.message : "Could not create booking");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Stepper current={4} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Passenger details</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Berths are already set — you chose them on the seat map.
            </p>
          </div>

          {err && (
            <Alert>
              {err}
              {staleSeats && (
                <button
                  type="button"
                  onClick={() => nav("/seats")}
                  className="ml-2 font-semibold underline"
                >
                  Re-pick seats
                </button>
              )}
            </Alert>
          )}

          {draft.seats.map((seat, i) => (
            <div key={seat.id} className="card p-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Passenger {i + 1}
              </div>

              {/* visual confirmation of the seat/berth picked on the map */}
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--color-accent-soft)] px-3 py-2.5 ring-1 ring-[var(--color-accent-ink)]/15">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-ink)] text-[11px] font-bold text-white">
                  {seat.seat_number.split("-").pop()}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    Coach {seat.coach_number} · Seat {seat.seat_number}
                  </div>
                  <div className="text-xs text-[var(--color-accent-ink)]/75">
                    {berthLabel(seat.seat_type)} · {inr(seat.fare)}
                  </div>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  className="ml-auto h-5 w-5 shrink-0 text-[var(--color-accent-ink)]"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M4 10.5l4 4 8-9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="label">Full name</span>
                  <input
                    className="field"
                    required
                    maxLength={100}
                    value={rows[i]?.name ?? ""}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </label>
                <label>
                  <span className="label">Date of birth</span>
                  <input
                    type="date"
                    className="field"
                    max={new Date().toISOString().slice(0, 10)}
                    value={rows[i]?.date_of_birth ?? ""}
                    onChange={(e) =>
                      update(i, { date_of_birth: e.target.value || null })
                    }
                  />
                </label>
                <label>
                  <span className="label">Gender</span>
                  <select
                    className="field"
                    value={rows[i]?.gender ?? "MALE"}
                    onChange={(e) =>
                      update(i, { gender: e.target.value as Gender })
                    }
                  >
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g[0] + g.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Email (optional)</span>
                  <input
                    type="email"
                    className="field"
                    value={rows[i]?.email ?? ""}
                    onChange={(e) => update(i, { email: e.target.value || null })}
                  />
                </label>
                <label>
                  <span className="label">Phone (optional)</span>
                  <input
                    className="field"
                    maxLength={20}
                    value={rows[i]?.phone ?? ""}
                    onChange={(e) => update(i, { phone: e.target.value || null })}
                  />
                </label>
              </div>
            </div>
          ))}

          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? "Reserving seats…" : "Continue to payment →"}
          </Button>
        </form>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="font-bold">{draft.result!.train.name}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {draft.coachType} · {draft.seats.length} seat
              {draft.seats.length === 1 ? "" : "s"} in {coachCount} coach
              {coachCount === 1 ? "" : "es"}
            </p>
            <div className="mt-4 space-y-1.5 text-sm">
              {draft.seats.map((s) => (
                <div key={s.id} className="flex justify-between">
                  <span>
                    {s.coach_number}·{s.seat_number}{" "}
                    <span className="text-[var(--color-muted)]">
                      {berthLabel(s.seat_type).replace(" berth", "")}
                    </span>
                  </span>
                  <span>{inr(s.fare)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-[var(--color-line)] pt-4 font-bold">
              <span>Total</span>
              <span>{inr(totalFare)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
