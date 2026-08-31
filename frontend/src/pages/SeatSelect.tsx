import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { CoachSeatMap, ScheduleDetail, SeatMapEntry } from "../lib/types";
import { useBooking, type SelectedSeat } from "../booking/BookingContext";
import { Alert, Button, Spinner } from "../components/ui";
import Stepper from "../components/Stepper";
import SeatMap from "../components/SeatMap";
import SlotCard from "../components/SlotCard";
import { COACH_LABEL, dayMonth, hhmm, inr } from "../lib/format";

const MAX_SEATS = 6;

export default function SeatSelect() {
  const nav = useNavigate();
  const { draft, patch } = useBooking();
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [maps, setMaps] = useState<CoachSeatMap[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSeat[]>(draft.seats);
  const [srcId, setSrcId] = useState<string | null>(draft.sourceStationId);
  const [dstId, setDstId] = useState<string | null>(draft.destStationId);

  const { result, coachType } = draft;

  useEffect(() => {
    if (!result || !coachType) {
      nav("/results");
      return;
    }
    Promise.all([api.schedule(result.id), api.seatMap(result.id, coachType)])
      .then(([d, m]) => {
        setDetail(d);
        setMaps(m);
        const src = d.route.stops.find(
          (s) => s.station.station_code === draft.search?.source,
        );
        const dst = d.route.stops.find(
          (s) => s.station.station_code === draft.search?.destination,
        );
        setSrcId((v) => v ?? src?.station.id ?? null);
        setDstId((v) => v ?? dst?.station.id ?? null);
      })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, coachType]);

  const activeMap = useMemo(
    () => maps?.find((m) => m.coach_id === coachId) ?? null,
    [maps, coachId],
  );

  const stops = detail?.route.stops ?? [];
  const srcSeq = stops.find((s) => s.station.id === srcId)?.stop_sequence ?? -1;
  const dstSeq = stops.find((s) => s.station.id === dstId)?.stop_sequence ?? -1;
  const segmentValid = srcSeq >= 0 && dstSeq >= 0 && srcSeq < dstSeq;

  function toggleSeat(s: SeatMapEntry) {
    const m = activeMap;
    if (!m) return;
    setSelected((cur) => {
      if (cur.some((x) => x.id === s.id)) return cur.filter((x) => x.id !== s.id);
      if (cur.length >= MAX_SEATS) return cur;
      return [
        ...cur,
        { ...s, coach_id: m.coach_id, coach_number: m.coach_number, fare: m.base_fare },
      ];
    });
  }

  function removeSeat(id: string) {
    setSelected((cur) => cur.filter((x) => x.id !== id));
  }

  const total = selected.reduce((sum, s) => sum + Number(s.fare), 0);
  const canContinue = selected.length > 0 && segmentValid;

  function cont() {
    if (!canContinue || !srcId || !dstId) return;
    patch({ sourceStationId: srcId, destStationId: dstId, seats: selected });
    nav("/passengers");
  }

  if (!result || !coachType) return null;
  if (err)
    return (
      <div>
        <Stepper current={3} />
        <Alert>{err}</Alert>
      </div>
    );
  if (!detail || !maps) return <Spinner label="Loading coaches…" />;

  const selectedInCoach = (m: CoachSeatMap) =>
    selected.filter((s) => s.coach_id === m.coach_id).length;
  const freeInCoach = (m: CoachSeatMap) =>
    m.seats.filter((s) => s.status === "AVAILABLE").length - selectedInCoach(m);

  const summary = (
    <div className="card p-5">
      <h2 className="font-bold">Your selection</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Up to {MAX_SEATS} seats across any coach. Tap a seat to add or remove.
      </p>
      <div className="mt-4 space-y-2">
        {selected.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">No seats picked yet.</p>
        )}
        {selected.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
          >
            <span>
              <b>{s.seat_number}</b>{" "}
              <span className="text-[var(--color-muted)]">
                {s.coach_number} · {s.seat_type.replace("_", " ").toLowerCase()}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {inr(s.fare)}
              <button
                onClick={() => removeSeat(s.id)}
                className="text-[var(--color-muted)] hover:text-[var(--color-danger)]"
                aria-label={`Remove ${s.seat_number}`}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-4">
        <span className="text-sm text-[var(--color-muted)]">
          {selected.length} seat{selected.length === 1 ? "" : "s"}
        </span>
        <span className="text-lg font-bold">{inr(total)}</span>
      </div>
      <Button className="mt-4 w-full" disabled={!canContinue} onClick={cont}>
        Add passengers →
      </Button>
    </div>
  );

  return (
    <div>
      <Stepper current={3} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-xl font-bold">{detail.train.name}</h1>
              <span className="text-sm text-[var(--color-muted)]">
                {detail.train.train_number} · {hhmm(detail.departure_time)}{" "}
                {dayMonth(detail.departure_time)}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">Boarding point</span>
                <select
                  className="field"
                  value={srcId ?? ""}
                  onChange={(e) => setSrcId(e.target.value)}
                >
                  {stops.map((s) => (
                    <option key={s.id} value={s.station.id}>
                      {s.station.name} ({s.station.station_code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Dropping point</span>
                <select
                  className="field"
                  value={dstId ?? ""}
                  onChange={(e) => setDstId(e.target.value)}
                >
                  {stops.map((s) => (
                    <option key={s.id} value={s.station.id}>
                      {s.station.name} ({s.station.station_code})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!segmentValid && (
              <p className="mt-2 text-xs text-[var(--color-danger)]">
                Dropping point must come after the boarding point on this route.
              </p>
            )}
          </div>

          <div className="card p-5">
            {!activeMap ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <span className="label mb-0">
                    {coachType} · {COACH_LABEL[coachType]}
                  </span>
                  <span className="ml-auto text-xs text-[var(--color-muted)]">
                    {maps.length} coach{maps.length === 1 ? "" : "es"} · pick one
                  </span>
                </div>
                {maps.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    No coaches of this class on this train.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {maps.map((m) => (
                      <SlotCard
                        key={m.coach_id}
                        title={`Coach ${m.coach_number}`}
                        sub={inr(m.base_fare)}
                        free={freeInCoach(m)}
                        total={m.seats.length}
                        selected={selectedInCoach(m)}
                        onClick={() => setCoachId(m.coach_id)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setCoachId(null)}
                    className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                      <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    All coaches
                  </button>
                  <span className="font-bold">Coach {activeMap.coach_number}</span>
                  <span className="text-sm text-[var(--color-muted)]">
                    {freeInCoach(activeMap)} of {activeMap.seats.length} free
                  </span>
                  <div className="no-scrollbar ml-auto flex max-w-full gap-1.5 overflow-x-auto">
                    {maps.map((m) => (
                      <button
                        key={m.coach_id}
                        onClick={() => setCoachId(m.coach_id)}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          m.coach_id === coachId
                            ? "bg-[var(--color-ink)] text-white"
                            : "bg-black/[0.06] hover:bg-black/[0.12]"
                        }`}
                      >
                        {m.coach_number}
                      </button>
                    ))}
                  </div>
                </div>
                <SeatMap
                  map={activeMap}
                  selectedIds={selected.map((s) => s.id)}
                  max={MAX_SEATS}
                  onToggle={toggleSeat}
                />
              </>
            )}
          </div>
        </div>

        {/* Desktop rail */}
        <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          {summary}
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-[68px] z-20 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {selected.length} seat{selected.length === 1 ? "" : "s"} · {inr(total)}
            </div>
            <div className="truncate text-xs text-[var(--color-muted)]">
              {selected.map((s) => `${s.coach_number}·${s.seat_number}`).join(", ") ||
                "Pick a coach, then seats"}
            </div>
          </div>
          <Button size="sm" disabled={!canContinue} onClick={cont}>
            Passengers →
          </Button>
        </div>
      </div>
    </div>
  );
}
