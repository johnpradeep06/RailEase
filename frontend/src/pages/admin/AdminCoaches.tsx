import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Coach, CoachType, SeatOut, Train } from "../../lib/types";
import { Alert, Button, Pill, Spinner } from "../../components/ui";
import { COACH_LABEL, inr } from "../../lib/format";
import { generateSeats } from "../../lib/seatgen";

const COACH_TYPES: CoachType[] = ["SL", "CC", "3AC", "2AC", "1AC"];

export default function AdminCoaches() {
  const [trains, setTrains] = useState<Train[]>([]);
  const [trainId, setTrainId] = useState("");
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    coach_number: "",
    coach_type: "SL" as CoachType,
    seat_capacity: 72,
    base_fare: 700,
  });

  const [openCoach, setOpenCoach] = useState<Coach | null>(null);
  const [seats, setSeats] = useState<SeatOut[] | null>(null);
  const [seatBusy, setSeatBusy] = useState(false);

  useEffect(() => {
    api.trains().then(setTrains).catch(() => {});
  }, []);

  function loadCoaches(id: string) {
    setCoaches(null);
    setOpenCoach(null);
    setSeats(null);
    if (!id) return;
    api.trainCoaches(id).then(setCoaches).catch((e) => setErr(e.message));
  }

  async function addCoach(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const c = await api.adminCreateCoach({
        train_id: trainId,
        coach_number: form.coach_number.trim(),
        coach_type: form.coach_type,
        seat_capacity: Number(form.seat_capacity),
        base_fare: Number(form.base_fare),
      });
      setOk(`Added coach ${c.coach_number}`);
      setForm((f) => ({ ...f, coach_number: "" }));
      loadCoaches(trainId);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to add coach");
    } finally {
      setBusy(false);
    }
  }

  function openSeats(c: Coach) {
    setOpenCoach(c);
    setSeats(null);
    setErr(null);
    api.coachSeats(c.id).then(setSeats).catch((e) => setErr(e.message));
  }

  const preview = useMemo(
    () =>
      openCoach
        ? generateSeats(openCoach.coach_type, openCoach.seat_capacity, openCoach.coach_number)
        : [],
    [openCoach],
  );

  async function saveSeats() {
    if (!openCoach) return;
    setSeatBusy(true);
    setErr(null);
    try {
      const created = await api.adminCreateSeats(openCoach.id, preview);
      setSeats(created);
      setOk(`Saved ${created.length} seats to ${openCoach.coach_number}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to save seats");
    } finally {
      setSeatBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <label className="block max-w-sm">
        <span className="label">Train</span>
        <select
          className="field"
          value={trainId}
          onChange={(e) => {
            setTrainId(e.target.value);
            loadCoaches(e.target.value);
          }}
        >
          <option value="">Select a train</option>
          {trains.map((t) => (
            <option key={t.id} value={t.id}>
              {t.train_number} — {t.name}
            </option>
          ))}
        </select>
      </label>

      {err && <Alert>{err}</Alert>}
      {ok && <Alert tone="info">{ok}</Alert>}

      {trainId && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <h2 className="mb-3 font-bold">Coaches</h2>
            {!coaches ? (
              <Spinner />
            ) : coaches.length === 0 ? (
              <div className="card p-6 text-sm text-[var(--color-muted)]">
                No coaches on this train yet.
              </div>
            ) : (
              <div className="space-y-2">
                {coaches.map((c) => (
                  <div
                    key={c.id}
                    className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${
                      openCoach?.id === c.id ? "ring-2 ring-[var(--color-accent)]" : ""
                    }`}
                  >
                    <div>
                      <span className="font-bold">{c.coach_number}</span>{" "}
                      <Pill>{c.coach_type}</Pill>{" "}
                      <span className="text-sm text-[var(--color-muted)]">
                        {COACH_LABEL[c.coach_type]} · {c.seat_capacity} seats ·{" "}
                        {inr(c.base_fare)}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openSeats(c)}>
                      Seats
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {openCoach && (
              <div className="card mt-4 p-5">
                <h3 className="font-bold">
                  Seats · coach {openCoach.coach_number}
                </h3>
                {seats === null ? (
                  <Spinner />
                ) : seats.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {seats.length} seats configured. The API has no seat edit or
                      delete.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {seats.slice(0, 120).map((s) => (
                        <span
                          key={s.id}
                          className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[11px]"
                          title={`${s.seat_number} · ${s.seat_type}`}
                        >
                          {s.seat_number.split("-").pop()}
                        </span>
                      ))}
                      {seats.length > 120 && (
                        <span className="text-[11px] text-[var(--color-muted)]">
                          +{seats.length - 120} more
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      No seats yet. Generate a full grid from the coach type and
                      capacity ({openCoach.seat_capacity} seats,{" "}
                      {openCoach.coach_type === "CC"
                        ? "rows of 6"
                        : openCoach.coach_type === "1AC"
                          ? "cabins of 4"
                          : openCoach.coach_type === "2AC"
                            ? "bays of 6"
                            : "bays of 8"}
                      ).
                    </p>
                    <Button
                      className="mt-3"
                      disabled={seatBusy}
                      onClick={saveSeats}
                    >
                      {seatBusy
                        ? "Saving…"
                        : `Generate & save ${preview.length} seats`}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <form onSubmit={addCoach} className="card h-fit p-5">
            <h2 className="font-bold">Add coach</h2>
            <div className="mt-4 space-y-3">
              <label>
                <span className="label">Coach number</span>
                <input
                  className="field"
                  required
                  maxLength={20}
                  value={form.coach_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, coach_number: e.target.value }))
                  }
                  placeholder="S1"
                />
              </label>
              <label>
                <span className="label">Type</span>
                <select
                  className="field"
                  value={form.coach_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, coach_type: e.target.value as CoachType }))
                  }
                >
                  {COACH_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t} — {COACH_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">Capacity</span>
                  <input
                    type="number"
                    min={1}
                    className="field"
                    required
                    value={form.seat_capacity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, seat_capacity: Number(e.target.value) }))
                    }
                  />
                </label>
                <label>
                  <span className="label">Base fare ₹</span>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    className="field"
                    required
                    value={form.base_fare}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, base_fare: Number(e.target.value) }))
                    }
                  />
                </label>
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Adding…" : "Add coach"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
