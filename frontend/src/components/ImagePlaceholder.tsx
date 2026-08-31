/**
 * Drop-in slot for an image the user will supply later.
 * Replace with <img src="..." className="h-full w-full object-cover" /> — the
 * wrapper already handles aspect ratio, rounding and responsiveness.
 */
export default function ImagePlaceholder({
  label,
  aspect = "16/10",
  className = "",
  rounded = "",
  dark = false,
}: {
  label: string;
  /** CSS aspect-ratio value, e.g. "16/10", "1/1", "4/3" */
  aspect?: string;
  className?: string;
  rounded?: string;
  dark?: boolean;
}) {
  return (
    <div
      data-image-placeholder={label}
      className={`placeholder-img ${rounded} ${className} ${
        dark ? "!bg-[var(--color-dark-2)] !text-white/50 !border-white/15" : ""
      }`}
      style={{ aspectRatio: aspect }}
    >
      <div className="flex flex-col items-center gap-1 px-3 text-center">
        <svg viewBox="0 0 24 24" className="h-6 w-6 opacity-60" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="8.5" cy="9.5" r="1.8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 17l4.5-4.5 3 3L15 12l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
}
