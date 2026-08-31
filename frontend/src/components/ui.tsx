import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-[var(--color-muted)]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-ink)]" />
      {label ?? "Loading…"}
    </div>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "ghost" | "on-dark";
  size?: "md" | "sm";
}) {
  const v = {
    primary: "btn-primary",
    dark: "btn-dark",
    ghost: "btn-ghost",
    "on-dark": "btn-on-dark",
  }[variant];
  return (
    <button
      {...rest}
      className={`btn ${v} ${size === "sm" ? "btn-sm" : ""} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-[var(--color-muted)]">{hint}</span>
      )}
    </label>
  );
}

export function Alert({
  children,
  tone = "danger",
}: {
  children: ReactNode;
  tone?: "danger" | "warn" | "info";
}) {
  const map = {
    danger: "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 text-[var(--color-danger)]",
    warn: "border-[var(--color-warn)]/30 bg-[var(--color-warn)]/10 text-[var(--color-warn)]",
    info: "border-[var(--color-line-strong)] bg-black/[0.03] text-[var(--color-ink-soft)]",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${map[tone]}`}>{children}</div>
  );
}

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "ok" | "warn" | "danger" | "accent";
  children: ReactNode;
}) {
  const map = {
    muted: "bg-black/5 text-[var(--color-muted)]",
    ok: "bg-[var(--color-ok)]/12 text-[var(--color-ok)]",
    warn: "bg-[var(--color-warn)]/14 text-[var(--color-warn)]",
    danger: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
    accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-black/[0.05] text-xl">
        🚉
      </span>
      <div>
        <div className="font-semibold">{title}</div>
        {sub && <div className="mt-1 text-sm text-[var(--color-muted)]">{sub}</div>}
      </div>
      {action}
    </div>
  );
}
