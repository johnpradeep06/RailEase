/** Availability card used for both the coach list and the bay list. */
export default function SlotCard({
  title,
  sub,
  free,
  total,
  selected = 0,
  onClick,
}: {
  title: string;
  sub?: string;
  free: number;
  total: number;
  selected?: number;
  onClick: () => void;
}) {
  const shown = Math.max(free, 0);
  const soldOut = shown <= 0;
  const pct = total ? (shown / total) * 100 : 0;
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        soldOut
          ? "border-[var(--color-line)] bg-black/[0.03] opacity-70 hover:opacity-100"
          : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-ink)] hover:shadow-[var(--shadow-soft)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{title}</span>
        {selected > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-bold text-[var(--color-accent-ink)]">
            {selected}
          </span>
        )}
      </div>
      {sub && <div className="text-[11px] text-[var(--color-muted)]">{sub}</div>}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
        <div
          className={`h-full rounded-full ${soldOut ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={`mt-1.5 text-xs ${
          soldOut
            ? "text-[var(--color-danger)]"
            : shown <= 3
              ? "text-[var(--color-warn)]"
              : "text-[var(--color-ok)]"
        }`}
      >
        {soldOut ? "Full" : `${shown} of ${total} free`}
      </div>
    </button>
  );
}
