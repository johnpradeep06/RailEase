import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { ScheduleDetail, ScheduleSummary, Train } from "../../lib/types";
import { Alert, Button, Pill, Spinner } from "../../components/ui";
import { dayMonth, hhmm } from "../../lib/format";

export default function AdminSchedules() {
  const [trains, setTrains] = useState<Train[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ScheduleSummary | null>(null);

  const [trainId, setTrainId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [journeyDate, setJourneyDate] = useState("");
  const [dep, setDep] = useState("");
  const [arr, setArr] = useState("");

  const [lookupId, setLookupId] = useState("");
  const [looked, setLooked] = useState<ScheduleDetail | null>(null);

  useEffect(() => {
    api.trains().then(setTrains).catch(() => {});
    try {
      const last = JSON.parse(localStorage.getItem("railease.lastRoute") || "null");
      if (last) {
        setRouteId(last.id);
        setTrainId(last.train_id);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCreated(null);
    setBusy(true);
    try {
      const s = await api.adminCreateSchedule({
        train_id: trainId,
        route_id: routeId.trim(),
        journey_date: journeyDate,
        departure_time: new Date(dep).toISOString(),
        arrival_time: new Date(arr).toISOString(),
        status: "SCHEDULED",
      });
      setCreated(s);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to create schedule");
    } finally {
      setBusy(false);
    }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLooked(null);
    try {
      setLooked(await api.schedule(lookupId.trim()));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Schedule not found");
    }
  }

  if (!trains.length) return <Spinner />;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card p-5 sm:p-6">
        <h2 className="font-bold">Create schedule</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Runs a train on a route for one date. The route must belong to the
          chosen train.
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
            <span className="label">Route id</span>
            <input
              className="field"
              required
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              placeholder="route uuid (from the Routes tab)"
            />
          </label>
          <label>
            <span className="label">Journey date</span>
            <input
              type="date"
              className="field"
              required
              value={journeyDate}
              onChange={(e) => setJourneyDate(e.target.value)}
            />
          </label>
          <div />
          <label>
            <span className="label">Departure</span>
            <input
              type="datetime-local"
              className="field"
              required
              value={dep}
              onChange={(e) => setDep(e.target.value)}
            />
          </label>
          <label>
            <span className="label">Arrival</span>
            <input
              type="datetime-local"
              className="field"
              required
              value={arr}
              onChange={(e) => setArr(e.target.value)}
            />
          </label>
        </div>
        {err && (
          <div className="mt-4">
            <Alert>{err}</Alert>
          </div>
        )}
        <Button type="submit" disabled={busy} className="mt-4">
          {busy ? "Creating…" : "Create schedule"}
        </Button>
      </form>

      {created && (
        <Alert tone="info">
          Schedule <code>{created.id}</code> created for{" "}
          {new Date(created.journey_date).toLocaleDateString("en-IN")}. Seats come
          from the train's coaches — add them in the Coaches &amp; seats tab, then
          it's bookable.
        </Alert>
      )}

      <form onSubmit={lookup} className="card p-5">
        <h2 className="font-bold">View a schedule by id</h2>
        <div className="mt-3 flex gap-2">
          <input
            className="field"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="schedule uuid"
          />
          <Button type="submit" variant="ghost">
            View
          </Button>
        </div>
        {looked && (
          <div className="mt-4 rounded-xl border border-[var(--color-line)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{looked.train.name}</span>
              <Pill tone={looked.status === "SCHEDULED" ? "ok" : "muted"}>
                {looked.status}
              </Pill>
            </div>
            <div className="mt-1 text-sm text-[var(--color-muted)]">
              {hhmm(looked.departure_time)} {dayMonth(looked.departure_time)} →{" "}
              {hhmm(looked.arrival_time)} {dayMonth(looked.arrival_time)} ·{" "}
              {looked.route.name} · {looked.route.stops.length} stops
            </div>
            <Link
              to="/book"
              className="mt-3 inline-block text-sm font-semibold underline"
            >
              Try booking it →
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}
