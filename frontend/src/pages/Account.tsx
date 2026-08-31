import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import type { BookingOut } from "../lib/types";
import { Button, Pill } from "../components/ui";
import { greeting } from "../lib/personalization";

export default function Account() {
  const { user, logout } = useAuth();
  const [bookings, setBookings] = useState<BookingOut[] | null>(null);

  useEffect(() => {
    api.myBookings().then(setBookings).catch(() => setBookings([]));
  }, []);

  if (!user) return null;

  const confirmed = bookings?.filter((b) => b.status === "CONFIRMED").length ?? 0;
  const initial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-4 bg-[var(--color-dark)] p-6 text-white">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-accent)] text-2xl font-bold text-[var(--color-accent-ink)]">
            {initial}
          </span>
          <div>
            <div className="text-sm text-white/60">{greeting(user.name)}</div>
            <div className="text-xl font-bold">{user.name || "Traveller"}</div>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
          <Row label="Email" value={user.email} />
          <Row label="Phone" value={user.phone || "—"} />
          <Row label="Date of birth" value={user.date_of_birth || "—"} />
          <Row
            label="Role"
            value={<Pill tone={user.role === "ADMIN" ? "accent" : "muted"}>{user.role}</Pill>}
          />
          <Row
            label="Account status"
            value={<Pill tone={user.status === "ACTIVE" ? "ok" : "warn"}>{user.status}</Pill>}
          />
          <Row label="Confirmed trips" value={String(confirmed)} />
        </dl>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/trips">
          <Button variant="ghost">My trips</Button>
        </Link>
        {user.role === "ADMIN" && (
          <Link to="/admin">
            <Button variant="dark">Admin panel</Button>
          </Link>
        )}
        <Button variant="ghost" onClick={logout} className="text-[var(--color-danger)]">
          Sign out
        </Button>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Profile editing isn't exposed by the API yet. Contact support via the{" "}
        <Link to="/feedback" className="underline">
          feedback
        </Link>{" "}
        form for changes.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
