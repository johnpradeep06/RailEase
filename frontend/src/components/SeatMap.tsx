import { useEffect, useMemo, useState } from "react";
import type { CoachSeatMap, SeatMapEntry } from "../lib/types";
import { SEAT_BADGE } from "../lib/format";
import SlotCard from "./SlotCard";

const BERTH_ORDER: Record<string, number> = {
  LOWER: 0,
  MIDDLE: 1,
  UPPER: 2,
  SIDE_LOWER: 0,
  SIDE_UPPER: 1,
};
const isMain = (t: string) => t === "LOWER" || t === "MIDDLE" || t === "UPPER";

// A chair car has no real bays, so its physical rows are chunked into
// blocks of this many so the drill-down view isn't an 80-seat wall.
const CC_ROWS_PER_BAY = 3;

function shortLabel(seatNumber: string) {
  const i = seatNumber.indexOf("-");
  return i >= 0 ? seatNumber.slice(i + 1) : seatNumber;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function groupBy<T>(items: T[], keyOf: (t: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    const a = m.get(k);
    if (a) a.push(it);
    else m.set(k, [it]);
  }
  return m;
}

interface Bay {
  key: number;
  seats: SeatMapEntry[];
  rows: { row: number; seats: SeatMapEntry[] }[];
  total: number;
  openSeats: number;
}

function Seat({
  seat,
  selected,
  disabledAdd,
  onToggle,
  compact = false,
}: {
  seat: SeatMapEntry;
  selected: boolean;
  disabledAdd: boolean;
  onToggle: (s: SeatMapEntry) => void;
  compact?: boolean;
}) {
  const taken = seat.status === "TAKEN";
  const badge = SEAT_BADGE[seat.seat_type];
  return (
    <button
      type="button"
      disabled={taken || (disabledAdd && !selected)}
      aria-pressed={selected}
      aria-label={`Seat ${seat.seat_number} ${seat.seat_type}${taken ? " (booked)" : ""}`}
      onClick={() => onToggle(seat)}
      title={`${seat.seat_number} · ${seat.seat_type.replace("_", " ")}`}
      className={[
        `relative grid shrink-0 place-items-center rounded-lg border text-[11px] font-semibold transition ${
          compact ? "h-9 w-9 sm:h-11 sm:w-11" : "h-11 w-11"
        }`,
        taken
          ? "cursor-not-allowed border-[var(--color-line)] bg-black/[0.06] text-[var(--color-muted)] line-through"
          : selected
            ? "border-[var(--color-accent-ink)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
            : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-ink)] hover:ring-2 hover:ring-[var(--color-accent)]/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-line)] disabled:hover:ring-0",
      ].join(" ")}
    >
      {shortLabel(seat.seat_number)}
      {badge && (
        <span className="absolute -bottom-1.5 right-0.5 rounded bg-[var(--color-ink)] px-1 text-[8px] font-bold leading-tight text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function SeatMap({
  map,
  selectedIds,
  max,
  onToggle,
}: {
  map: CoachSeatMap;
  selectedIds: string[];
  max: number;
  onToggle: (s: SeatMapEntry) => void;
}) {
  const atMax = selectedIds.length >= max;
  const isChairCar = map.seats.every((s) => s.seat_type === "SEAT");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => setOpen(null), [map.coach_id]);

  const maxCol = useMemo(
    () => Math.max(1, ...map.seats.map((s) => s.column_number)),
    [map],
  );
  const aisleAfter = isChairCar ? Math.ceil(maxCol / 2) : 0;

  const bays = useMemo<Bay[]>(() => {
    const byBay = groupBy(map.seats, (s) =>
      isChairCar ? Math.floor((s.row_number - 1) / CC_ROWS_PER_BAY) + 1 : s.row_number,
    );
    return [...byBay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, seats]) => {
        const rows = [...groupBy(seats, (s) => s.row_number).entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([row, rs]) => ({
            row,
            seats: rs.sort((a, b) => a.column_number - b.column_number),
          }));
        return {
          key,
          seats,
          rows,
          total: seats.length,
          openSeats: seats.filter((s) => s.status === "AVAILABLE").length,
        };
      });
  }, [map, isChairCar]);

  const seatProps = (s: SeatMapEntry) => ({
    seat: s,
    selected: selectedIds.includes(s.id),
    disabledAdd: atMax,
    onToggle,
  });
  const selectedIn = (b: Bay) =>
    b.seats.filter((s) => selectedIds.includes(s.id)).length;
  const freeIn = (b: Bay) => b.openSeats - selectedIn(b);

  const openBay = open != null ? (bays.find((b) => b.key === open) ?? null) : null;
  const openFree = openBay ? freeIn(openBay) : 0;

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-[var(--color-muted)]">
        <Legend swatch="border-[var(--color-line)] bg-[var(--color-surface)]" label="Available" />
        <Legend swatch="border-[var(--color-accent-ink)] bg-[var(--color-accent)]" label="Selected" />
        <Legend swatch="border-[var(--color-line)] bg-black/[0.06]" label="Booked" />
        {!isChairCar && (
          <span className="ml-auto">LB/MB/UB = lower / middle / upper · SL/SU = side</span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          <span className="h-px flex-1 bg-[var(--color-line)]" />
          Coach {map.coach_number} · {isChairCar ? "chair car" : "engine side"}
          <span className="h-px flex-1 bg-[var(--color-line)]" />
        </div>

        {openBay ? (
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={() => setOpen(null)}
                className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                All compartments
              </button>
              <span className="font-bold">Bay {openBay.key}</span>
              <span
                className={`text-sm ${
                  openFree === 0
                    ? "text-[var(--color-danger)]"
                    : "text-[var(--color-ok)]"
                }`}
              >
                {openFree} of {openBay.total} free
              </span>
            </div>

            {/* seat visualisation — scrolls inside the card if a row is too wide */}
            <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
              {isChairCar ? (
                <div className="flex w-max flex-col gap-2.5">
                  {openBay.rows.map(({ row, seats }) => (
                    <div key={row} className="flex items-center gap-1.5">
                      <span className="w-7 shrink-0 text-right text-[11px] font-medium text-[var(--color-muted)]">
                        R{row}
                      </span>
                      <div className="flex gap-1.5">
                        {seats
                          .filter((s) => s.column_number <= aisleAfter)
                          .map((s) => (
                            <Seat key={s.id} {...seatProps(s)} compact />
                          ))}
                      </div>
                      <span className="mx-1 self-stretch border-l border-dashed border-[var(--color-line-strong)]" />
                      <div className="flex gap-1.5">
                        {seats
                          .filter((s) => s.column_number > aisleAfter)
                          .map((s) => (
                            <Seat key={s.id} {...seatProps(s)} compact />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <BayDetail seats={openBay.seats} seatProps={seatProps} />
              )}
            </div>

            <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto border-t border-[var(--color-line)] pt-4">
              {bays.map((b) => (
                <button
                  key={b.key}
                  onClick={() => setOpen(b.key)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    b.key === open
                      ? "bg-[var(--color-ink)] text-white"
                      : freeIn(b) === 0
                        ? "bg-black/[0.04] text-[var(--color-muted)]"
                        : "bg-black/[0.06] hover:bg-black/[0.12]"
                  }`}
                >
                  B{b.key}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {bays.map((b) => (
              <SlotCard
                key={b.key}
                title={`Bay ${b.key}`}
                free={freeIn(b)}
                total={b.total}
                selected={selectedIn(b)}
                onClick={() => setOpen(b.key)}
              />
            ))}
          </div>
        )}
      </div>

      {!openBay && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Pick a {isChairCar ? "block" : "bay"} to see its seats.
        </p>
      )}
    </div>
  );
}

function BayDetail({
  seats,
  seatProps,
}: {
  seats: SeatMapEntry[];
  seatProps: (s: SeatMapEntry) => {
    seat: SeatMapEntry;
    selected: boolean;
    disabledAdd: boolean;
    onToggle: (s: SeatMapEntry) => void;
  };
}) {
  const mains = chunk(
    seats
      .filter((s) => isMain(s.seat_type))
      .sort(
        (a, b) =>
          BERTH_ORDER[a.seat_type] - BERTH_ORDER[b.seat_type] ||
          a.column_number - b.column_number,
      ),
    3,
  );
  const sides = seats
    .filter((s) => !isMain(s.seat_type))
    .sort((a, b) => BERTH_ORDER[a.seat_type] - BERTH_ORDER[b.seat_type]);

  return (
    <div className="flex w-max items-start gap-3">
      {mains.map((grp, gi) => (
        <div key={gi} className="flex flex-col gap-2">
          {grp.map((s) => (
            <Seat key={s.id} {...seatProps(s)} />
          ))}
        </div>
      ))}
      {sides.length > 0 && (
        <>
          <span className="mx-1.5 self-stretch border-l border-dashed border-[var(--color-line-strong)]" />
          <div className="flex flex-col gap-2">
            {sides.map((s) => (
              <Seat key={s.id} {...seatProps(s)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-4 w-4 rounded border ${swatch}`} />
      {label}
    </span>
  );
}
