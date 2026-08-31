import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Pill, Spinner } from "../../components/ui";

const TABS = [
  { to: "/admin/trains", label: "Trains" },
  { to: "/admin/stations", label: "Stations" },
  { to: "/admin/routes", label: "Routes" },
  { to: "/admin/schedules", label: "Schedules" },
  { to: "/admin/coaches", label: "Coaches & seats" },
  { to: "/admin/ops", label: "Bookings & feedback" },
];

const MATRIX: { feature: string; state: "yes" | "partial" | "no"; note: string }[] = [
  { feature: "Admin login", state: "yes", note: "Same login; role checked from /auth/me" },
  { feature: "Admin register", state: "no", note: "No endpoint — promote a user in the DB" },
  { feature: "Create train", state: "yes", note: "POST /trains" },
  { feature: "Update train", state: "no", note: "No PATCH/PUT /trains/{id}" },
  { feature: "Delete / deactivate train", state: "no", note: "No DELETE /trains/{id}" },
  { feature: "Manage stations", state: "partial", note: "Create + list only (no edit/delete)" },
  { feature: "Manage routes & stops", state: "partial", note: "Create + view by id (no list-all / edit / delete)" },
  { feature: "Manage coaches & seats", state: "partial", note: "Create coach, list per train, bulk-add seats (no edit/delete)" },
  { feature: "View / manage all bookings", state: "partial", note: "Look up by booking id + cancel (no browse-all)" },
  { feature: "Manage users", state: "no", note: "No user endpoints in the API" },
  { feature: "Manage feedback", state: "partial", note: "Respond by feedback id (no list-all)" },
  { feature: "Create schedule", state: "yes", note: "POST /schedules (bonus — needed for the seat map)" },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;

  const onIndex = loc.pathname === "/admin" || loc.pathname === "/admin/";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Pill tone="accent">ADMIN</Pill>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "bg-[var(--color-ink)] text-white"
                  : "bg-black/[0.05] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      {onIndex ? (
        <div className="card p-5 sm:p-6">
          <h2 className="font-bold">What the API supports</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Only create/read endpoints are exposed for the catalogue — there are
            no update or delete routes, and no list-all for bookings, users or
            feedback. This panel implements everything that is actually callable.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {MATRIX.map((m) => (
                  <tr key={m.feature} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{m.feature}</td>
                    <td className="py-2.5 pr-3">
                      <Pill
                        tone={m.state === "yes" ? "ok" : m.state === "partial" ? "warn" : "danger"}
                      >
                        {m.state === "yes" ? "Available" : m.state === "partial" ? "Partial" : "Not in API"}
                      </Pill>
                    </td>
                    <td className="py-2.5 text-[var(--color-muted)]">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
