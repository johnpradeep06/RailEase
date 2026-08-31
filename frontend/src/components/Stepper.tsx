import { useNavigate } from "react-router-dom";

const STEPS = ["Search", "Trains", "Seats", "Passengers", "Payment", "Done"] as const;

export default function Stepper({ current }: { current: number }) {
  const nav = useNavigate();
  return (
    <div className="mb-7">
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav(-1)}
          className="flex shrink-0 items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        {/* Desktop full stepper */}
        <div className="hidden flex-1 items-center md:flex">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < current;
            const active = n === current;
            return (
              <div key={label} className="flex flex-1 items-center last:flex-none">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    active
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                      : done
                        ? "bg-[var(--color-ink)] text-white"
                        : "border border-[var(--color-line-strong)] text-[var(--color-muted)]"
                  }`}
                >
                  {done ? "✓" : n}
                </span>
                <span
                  className={`ml-2 shrink-0 text-sm ${
                    active ? "font-semibold" : done ? "" : "text-[var(--color-muted)]"
                  }`}
                >
                  {label}
                </span>
                {n < STEPS.length && (
                  <span
                    className={`mx-3 h-px flex-1 ${done ? "bg-[var(--color-ink)]" : "bg-[var(--color-line)]"}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile compact */}
        <div className="flex flex-1 items-center gap-3 md:hidden">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-line)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all"
              style={{ width: `${(current / STEPS.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-semibold">
            {STEPS[current - 1]}{" "}
            <span className="font-normal text-[var(--color-muted)]">
              {current}/{STEPS.length}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
