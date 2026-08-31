import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Route, Station, Train } from "../../lib/types";
import { Alert, Button, Pill, Spinner } from "../../components/ui";

interface StopRow {
  station_id: string;
  arrival_time: string;
  departure_time: string;
  day_offset: number;
}

const emptyStop = (): StopRow => ({
  station_id: "",
  arrival_time: "",
  departure_time: "",
  day_offset: 0,
});

function RouteView({ r }: { r: Route }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{r.name}</h3>
        <Pill tone={r.status === "ACTIVE" ? "ok" : "muted"}>{r.status}</Pill>
        <code className="text-xs text-[var(--color-muted)]">{r.id}</code>
      </div>
      <ol className="mt-3 space-y-2">
        {r.stops.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-black/[0.06] text-xs font-bold">
              {s.stop_sequence}
            </span>
            <span className="font-medium">
              {s.station.name} ({s.station.station_code})
            </span>
            <span className="text-[var(--color-muted)]">
              {s.arrival_time ? `arr ${s.arrival_time}` : "—"} ·{" "}
              {s.departure_time ? `dep ${s.departure_time}` : "—"}
              {s.day_offset ? ` · day +${s.day_offset}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function AdminRoutes() {
  const [trains, setTrains] = useState<Train[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Route | null>(null);

  const [trainId, setTrainId] = useState("");
  const [name, setName] = useState("");
  const [stops, setStops] = useState<StopRow[]>([emptyStop(), emptyStop()]);

  const [lookupId, setLookupId] = useState("");
  const [looked, setLooked] = useState<Route | null>(null);

  useEffect(() => {
    api.trains().then(setTrains).catch(() => {});
    api.stations().then(setStations).catch(() => {});
  }, []);

  function setStop(i: number, p: Partial<StopRow>) {
    setStops((s) => s.map((row, idx) => (idx === i ? { ...row, ...p } : row)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCreated(null);
    if (stops.some((s) => !s.station_id)) {
      setErr("Every stop needs a station");
      return;
    }
    setBusy(true);
    try {
      const r = await api.adminCreateRoute({
        train_id: trainId,
        name: name.trim(),
        status: "ACTIVE",
        stops: stops.map((s, i) => ({
          station_id: s.station_id,
          stop_sequence: i + 1,
          arrival_time: s.arrival_time ? `${s.arrival_time}:00` : null,
          departure_time: s.departure_time ? `${s.departure_time}:00` : null,
          day_offset: Number(s.day_offset) || 0,
        })),
      });
      setCreated(r);
      localStorage.setItem(
        "railease.lastRoute",
        JSON.stringify({ id: r.id, train_id: r.train_id, name: r.name }),
      );
      setName("");
      setStops([emptyStop(), emptyStop()]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to create route");
    } finally {
      setBusy(false);
    }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLooked(null);
    try {
      setLooked(await api.route(lookupId.trim()));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Route not found");
    }
  }

  if (!trains.length && !stations.length) return <Spinner />;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card p-5 sm:p-6">
        <h2 className="font-bold">Create route</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          A route belongs to one train and needs at least 2 stops in order.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Train</span>
            <select
              className="field"
              required
              value={trainId}
              onChange={(e) => setTrainId(e.target.value)}
            >
              <option value="">Select train</option>
              {trains.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.train_number} — {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Route name</span>
            <input
              className="field"
              required
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New Delhi - Mumbai Central"
            />
          </label>
        </div>

        <div className="mt-5 space-y-3">
          <span className="label mb-0">Stops</span>
          {stops.map((s, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-xl border border-[var(--color-line)] p-3 sm:grid-cols-[1.6fr_1fr_1fr_0.7fr_auto]"
            >
              <select
                className="field"
                value={s.station_id}
                onChange={(e) => setStop(i, { station_id: e.target.value })}
              >
                <option value="">Stop {i + 1} — station</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.station_code})
                  </option>
                ))}
              </select>
              <input
                type="time"
                className="field"
                value={s.arrival_time}
                onChange={(e) => setStop(i, { arrival_time: e.target.value })}
                title="Arrival"
              />
              <input
                type="time"
                className="field"
                value={s.departure_time}
                onChange={(e) => setStop(i, { departure_time: e.target.value })}
                title="Departure"
              />
              <input
                type="number"
                min={0}
                className="field"
                value={s.day_offset}
                onChange={(e) => setStop(i, { day_offset: Number(e.target.value) })}
                title="Day offset"
              />
              <button
                type="button"
                disabled={stops.length <= 2}
                onClick={() => setStops((x) => x.filter((_, idx) => idx !== i))}
                className="rounded-lg px-2 text-[var(--color-muted)] hover:text-[var(--color-danger)] disabled:opacity-30"
                aria-label="Remove stop"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setStops((s) => [...s, emptyStop()])}
            className="chip hover:bg-black/10"
          >
            + Add stop
          </button>
        </div>

        {err && (
          <div className="mt-4">
            <Alert>{err}</Alert>
          </div>
        )}
        <Button type="submit" disabled={busy} className="mt-4">
          {busy ? "Creating…" : "Create route"}
        </Button>
      </form>

      {created && (
        <div>
          <h2 className="mb-2 font-bold">Created</h2>
          <RouteView r={created} />
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Route id saved — the Schedules tab will pre-fill it.
          </p>
        </div>
      )}

      <form onSubmit={lookup} className="card p-5">
        <h2 className="font-bold">View a route by id</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          The API has no list-all-routes endpoint.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className="field"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="route uuid"
          />
          <Button type="submit" variant="ghost">
            View
          </Button>
        </div>
        {looked && (
          <div className="mt-4">
            <RouteView r={looked} />
          </div>
        )}
      </form>
    </div>
  );
}
