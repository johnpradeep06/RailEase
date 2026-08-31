import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { BerthPreference, Gender, PassengerCreate } from "../lib/types";
import { useBooking } from "../booking/BookingContext";
import { Alert, Button } from "../components/ui";
import Stepper from "../components/Stepper";
import { inr } from "../lib/format";

const GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER"];
const BERTHS: BerthPreference[] = [
  "NO_PREFERENCE",
  "LOWER",
  "MIDDLE",
  "UPPER",
  "SIDE_LOWER",
  "SIDE_UPPER",
];

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
  const isChairCar = draft.coachType === "CC";
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
        passengers: rows.map((r) => ({
          ...r,
          berth_preference: isChairCar ? "NO_PREFERENCE" : r.berth_preference,
          date_of_birth: r.date_of_birth || null,
          email: r.email || null,
          phone: r.phone || null,
        })),
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
          <h1 className="text-2xl font-bold">Passenger details</h1>

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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">Passenger {i + 1}</span>
                <span className="chip">
                  Coach {seat.coach_number} · {seat.seat_number} ·{" "}
                  {seat.seat_type.replace("_", " ").toLowerCase()}
                </span>
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
                {!isChairCar && (
                  <label>
                    <span className="label">Berth preference</span>
                    <select
                      className="field"
                      value={rows[i]?.berth_preference ?? "NO_PREFERENCE"}
                      onChange={(e) =>
                        update(i, {
                          berth_preference: e.target.value as BerthPreference,
                        })
                      }
                    >
                      {BERTHS.map((b) => (
                        <option key={b} value={b}>
                          {b.replace("_", " ").toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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
                    {s.coach_number}·{s.seat_number}
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
