import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Station } from "../../lib/types";
import { Alert, Button, Pill, Spinner } from "../../components/ui";

export default function AdminStations() {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    station_code: "",
    name: "",
    city: "",
    state: "",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  });

  function load() {
    api.stations().then(setStations).catch((e) => setErr(e.message));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const s = await api.adminCreateStation({
        station_code: form.station_code.trim().toUpperCase(),
        name: form.name.trim(),
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        status: form.status,
      });
      setOk(`Created ${s.station_code} — ${s.name}`);
      setForm({ station_code: "", name: "", city: "", state: "", status: "ACTIVE" });
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to create station");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <h2 className="mb-3 font-bold">All stations</h2>
        {!stations ? (
          <Spinner />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-line)]">
                  <th className="p-3">Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">City</th>
                  <th className="p-3">State</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3 font-medium">{s.station_code}</td>
                    <td className="p-3">{s.name}</td>
                    <td className="p-3 text-[var(--color-muted)]">{s.city || "—"}</td>
                    <td className="p-3 text-[var(--color-muted)]">{s.state || "—"}</td>
                    <td className="p-3">
                      <Pill tone={s.status === "ACTIVE" ? "ok" : "muted"}>{s.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Create + list only — the API has no station update or delete.
        </p>
      </div>

      <form onSubmit={submit} className="card h-fit p-5">
        <h2 className="font-bold">Add station</h2>
        <div className="mt-4 space-y-3">
          <label>
            <span className="label">Station code</span>
            <input
              className="field uppercase"
              required
              maxLength={10}
              value={form.station_code}
              onChange={(e) => setForm((f) => ({ ...f, station_code: e.target.value }))}
              placeholder="NDLS"
            />
          </label>
          <label>
            <span className="label">Name</span>
            <input
              className="field"
              required
              maxLength={150}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="New Delhi"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">City</span>
              <input
                className="field"
                maxLength={100}
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>
            <label>
              <span className="label">State</span>
              <input
                className="field"
                maxLength={100}
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              />
            </label>
          </div>
          <label>
            <span className="label">Status</span>
            <select
              className="field"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" | "INACTIVE" }))
              }
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>
          {err && <Alert>{err}</Alert>}
          {ok && <Alert tone="info">{ok}</Alert>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create station"}
          </Button>
        </div>
      </form>
    </div>
  );
}
