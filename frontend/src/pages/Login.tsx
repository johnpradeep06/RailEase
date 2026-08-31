import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { Alert, Button } from "../components/ui";
import ImagePlaceholder from "../components/ImagePlaceholder";

export default function Login() {
  const { login, register, sessionExpired, clearExpired } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.name, form.email, form.password, form.phone || undefined);
      clearExpired();
      nav(from, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-lift)] lg:grid lg:min-h-[34rem] lg:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-dark)] p-10 text-white lg:flex">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10">
              <svg viewBox="0 0 32 32" className="h-6 w-6">
                <path d="M12 6v20M20 6v20M9 12h14M9 20h14" stroke="#c9f24d" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-display text-xl font-bold">RailEase</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold leading-[1.04]">
              Every train,
              <br />
              <span className="text-[var(--color-accent)]">one account.</span>
            </h1>
            <p className="mt-3 text-sm text-white/70">
              Live schedules, a real seat map, tickets and PNR — in one place, on
              every screen.
            </p>
            <div className="mt-6">
              <ImagePlaceholder label="Lifestyle / train photo" aspect="16/9" dark rounded="rounded-2xl" />
            </div>
          </div>
          <p className="text-xs text-white/40">Indian Railways · demo build</p>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-6 py-10 sm:p-10 lg:p-12">
          <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[var(--color-ink)]">
              <svg viewBox="0 0 32 32" className="h-5 w-5">
                <path d="M12 6v20M20 6v20M9 12h14M9 20h14" stroke="#c9f24d" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-display text-lg font-bold">RailEase</span>
          </div>

          <h2 className="text-2xl font-bold">
            {mode === "login" ? "Sign in to book" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {mode === "login"
              ? "Tickets, PNR status and refunds in one place."
              : "Takes a few seconds. No card needed."}
          </p>

          {sessionExpired && (
            <div className="mt-4">
              <Alert tone="warn">Your session expired — please sign in again.</Alert>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <div>
                <span className="label">Full name</span>
                <input className="field" required value={form.name} onChange={set("name")} placeholder="Ananya Rao" />
              </div>
            )}
            <div>
              <span className="label">Email</span>
              <input className="field" type="email" required value={form.email} onChange={set("email")} placeholder="you@example.com" />
            </div>
            {mode === "register" && (
              <div>
                <span className="label">Phone (optional)</span>
                <input className="field" value={form.phone} onChange={set("phone")} placeholder="+91 90000 00000" />
              </div>
            )}
            <div>
              <span className="label">Password</span>
              <input className="field" type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="At least 8 characters" />
            </div>

            {err && <Alert>{err}</Alert>}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Please wait…" : mode === "login" ? "Sign in →" : "Create account →"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[var(--color-muted)]">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setErr(null);
              }}
              className="font-semibold text-[var(--color-ink)] underline hover:no-underline"
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
          <p className="mt-4 text-center text-xs text-[var(--color-muted)]">
            Demo: <code>user@railease.test</code> / <code>user12345</code>
          </p>
          </div>
        </div>
      </div>
    </div>
  );
}
