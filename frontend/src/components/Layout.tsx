import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[var(--color-ink)]">
        <svg viewBox="0 0 32 32" className="h-5 w-5">
          <path
            d="M12 6v20M20 6v20M9 12h14M9 20h14"
            stroke="#c9f24d"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="leading-none">
        <span
          className={`block font-display text-lg font-bold tracking-tight ${onDark ? "text-white" : ""}`}
        >
          RailEase
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          Indian Railways
        </span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: "/", label: "Home", icon: IconHome, end: true },
  { to: "/book", label: "Book", icon: IconTrain },
  { to: "/trips", label: "Trips", icon: IconTicket },
  { to: "/feedback", label: "Feedback", icon: IconChat },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Desktop / tablet top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {(user?.role === "ADMIN"
              ? [...NAV, { to: "/admin", label: "Admin", icon: IconHome, end: false }]
              : NAV
            ).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-[var(--color-ink)] text-white"
                      : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="relative">
            <button
              onClick={() => setMenu((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] py-1.5 pl-1.5 pr-3 hover:bg-black/[0.03]"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-accent)] text-sm font-bold text-[var(--color-accent-ink)]">
                {initial}
              </span>
              <span className="hidden max-w-[9rem] truncate text-sm font-medium sm:block">
                {user?.name || user?.email}
              </span>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[var(--color-muted)]" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-lift)]">
                  <div className="border-b border-[var(--color-line)] px-4 py-3">
                    <div className="text-sm font-semibold">{user?.name || "Traveller"}</div>
                    <div className="truncate text-xs text-[var(--color-muted)]">{user?.email}</div>
                  </div>
                  <Link
                    to="/account"
                    onClick={() => setMenu(false)}
                    className="block px-4 py-2.5 text-sm hover:bg-black/[0.04]"
                  >
                    Account
                  </Link>
                  {user?.role === "ADMIN" && (
                    <Link
                      to="/admin"
                      onClick={() => setMenu(false)}
                      className="block px-4 py-2.5 text-sm hover:bg-black/[0.04]"
                    >
                      Admin panel
                    </Link>
                  )}
                  <Link
                    to="/trips"
                    onClick={() => setMenu(false)}
                    className="block px-4 py-2.5 text-sm hover:bg-black/[0.04]"
                  >
                    My trips
                  </Link>
                  <button
                    onClick={() => {
                      setMenu(false);
                      logout();
                    }}
                    className="block w-full px-4 py-2.5 text-left text-sm text-[var(--color-danger)] hover:bg-black/[0.04]"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container-page flex-1 py-6 pb-32 lg:py-10 lg:pb-14">
        <Outlet />
      </main>

      {/* Floating glass dock (mobile / tablet) */}
      <div className="dock lg:hidden">
        <nav className="glass-panel mx-auto flex max-w-sm items-center justify-around gap-0.5 rounded-[1.6rem] p-1.5">
          {DOCK.map((n) => {
            const active =
              n.to === "/"
                ? loc.pathname === "/"
                : loc.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className="flex flex-1 flex-col items-center gap-0.5 rounded-[1.1rem] py-1 text-[10px] font-semibold"
              >
                <span
                  className={`grid h-9 w-full max-w-[2.9rem] place-items-center rounded-full transition ${
                    active
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[0_4px_14px_-4px_rgba(201,242,77,0.9)]"
                      : "text-[var(--color-muted)]"
                  }`}
                >
                  {n.to === "/account" && !active ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-black/[0.07] text-[11px] font-bold text-[var(--color-ink)]">
                      {initial}
                    </span>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </span>
                <span className={active ? "text-[var(--color-ink)]" : "text-[var(--color-muted)]"}>
                  {n.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

const DOCK = [
  { to: "/", label: "Home", icon: IconHome },
  { to: "/book", label: "Book", icon: IconTrain },
  { to: "/trips", label: "Trips", icon: IconTicket },
  { to: "/feedback", label: "Feedback", icon: IconChat },
  { to: "/account", label: "Account", icon: IconUser },
];

function IconUser({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconHome({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M4 11l8-6 8 6M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTrain({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect x="6" y="3" width="12" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 10h12M9 21l-2 0M17 21l-2 0M9.5 21l5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="13.5" r="1" fill="currentColor" />
      <circle cx="15" cy="13.5" r="1" fill="currentColor" />
    </svg>
  );
}
function IconTicket({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M4 8a2 2 0 012-2h12a2 2 0 012 2 2 2 0 000 4 2 2 0 010 4H6a2 2 0 01-2-2 2 2 0 000-4 2 2 0 010-4z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 6v12" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2 2" />
    </svg>
  );
}
function IconChat({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 3V6a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
