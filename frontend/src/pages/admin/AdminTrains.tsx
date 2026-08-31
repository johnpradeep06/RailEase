import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Train } from "../../lib/types";
import { Alert, Button, Pill, Spinner } from "../../components/ui";

export default function AdminTrains() {
  const [trains, setTrains] = useState<Train[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    train_number: "",
    name: "",
    train_type: "",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  });

  function load() {
    api.trains().then(setTrains).catch((e) => setErr(e.message));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const t = await api.adminCreateTrain({
        train_number: form.train_number.trim(),
        name: form.name.trim(),
        train_type: form.train_type.trim() || null,
        status: form.status,
      });
      setOk(`Created ${t.train_number} — ${t.name}`);
      setForm({ train_number: "", name: "", train_type: "", status: "ACTIVE" });
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to create train");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <h2 className="mb-3 font-bold">All trains</h2>
        {!trains ? (
          <Spinner />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-line)]">
                  <th className="p-3">Number</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {trains.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="p-3 font-medium">{t.train_number}</td>
                    <td className="p-3">{t.name}</td>
                    <td className="p-3 text-[var(--color-muted)]">{t.train_type || "—"}</td>
                    <td className="p-3">
                      <Pill tone={t.status === "ACTIVE" ? "ok" : "muted"}>{t.status}</Pill>
                    </td>
                  </tr>
                ))}
                {trains.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-[var(--color-muted)]">
                      No trains yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          The API has no update or delete for trains — create only.
        </p>
      </div>

      <form onSubmit={submit} className="card h-fit p-5">
        <h2 className="font-bold">Add train</h2>
        <div className="mt-4 space-y-3">
          <label>
            <span className="label">Train number</span>
            <input
              className="field"
              required
              maxLength={20}
              value={form.train_number}
              onChange={(e) => setForm((f) => ({ ...f, train_number: e.target.value }))}
              placeholder="12951"
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
              placeholder="Mumbai Rajdhani Express"
            />
          </label>
          <label>
            <span className="label">Type (optional)</span>
            <input
              className="field"
              maxLength={50}
              value={form.train_type}
              onChange={(e) => setForm((f) => ({ ...f, train_type: e.target.value }))}
              placeholder="Rajdhani"
            />
          </label>
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
            {busy ? "Creating…" : "Create train"}
          </Button>
        </div>
      </form>
    </div>
  );
}
