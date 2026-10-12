"""Concurrency demo: N users try to book the SAME seat at the same instant.

Usage (backend must be running):
    python race_demo.py                        # 2 users, 10 rounds, local API
    python race_demo.py --users 5 --rounds 20
    python race_demo.py --base https://fastapi-backend-production-6703.up.railway.app

Pass criteria, per round: exactly ONE 201, everyone else 409, and no 5xx.
Stdlib only. Creates throw-away users race<N>@railease.test and cancels the
winning booking after every round so the seat map is left untouched.
"""
import argparse
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta

PASSWORD = "race12345"


def call(base, method, path, body=None, token=None, form=False):
    headers = {}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode(errors="replace")


def login(base, i):
    email = f"race{i}@railease.test"
    call(base, "POST", "/auth/register", {"name": f"Racer {i}", "email": email, "password": PASSWORD})
    status, body = call(base, "POST", "/auth/login", {"username": email, "password": PASSWORD}, form=True)
    assert status == 200, f"login failed for {email}: {status} {body}"
    return body["access_token"]


def find_schedule(base):
    today = date.today()
    for offset in range(0, 40):
        d = (today + timedelta(days=offset)).isoformat()
        status, res = call(base, "GET", f"/schedules/search?source=NDLS&destination=BCT&journey_date={d}")
        if status == 200 and res:
            return res[0]["id"]
    raise SystemExit("No NDLS->BCT schedule found — run seed.py first")


def free_seats(base, schedule_id):
    _, maps = call(base, "GET", f"/schedules/{schedule_id}/seats?coach_type=SL")
    return [s["id"] for m in maps for s in m["seats"] if s["status"] == "AVAILABLE"]


def passenger(i):
    return {"name": f"Racer {i}", "gender": "MALE", "berth_preference": "NO_PREFERENCE"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--users", type=int, default=2)
    ap.add_argument("--rounds", type=int, default=10)
    ap.add_argument("--keep", action="store_true", help="don't cancel winning bookings")
    args = ap.parse_args()

    tokens = [login(args.base, i) for i in range(1, args.users + 1)]
    sid = find_schedule(args.base)
    _, sched = call(args.base, "GET", f"/schedules/{sid}")
    stops = {s["station"]["station_code"]: s["station"]["id"] for s in sched["route"]["stops"]}
    src, dst = stops["NDLS"], stops["BCT"]
    seats = free_seats(args.base, sid)
    assert len(seats) >= args.rounds, "not enough free seats for that many rounds"

    totals = Counter()
    violations = 0
    for rnd in range(args.rounds):
        seat = seats[rnd]
        barrier = threading.Barrier(args.users)
        results = [None] * args.users

        def worker(i):
            payload = {
                "schedule_id": sid,
                "source_station_id": src,
                "destination_station_id": dst,
                "seat_ids": [seat],
                "passengers": [passenger(i + 1)],
            }
            barrier.wait()  # release every thread at the same instant
            results[i] = call(args.base, "POST", "/bookings", payload, tokens[i])

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(args.users)]
        [t.start() for t in threads]
        [t.join() for t in threads]

        codes = [r[0] for r in results]
        totals.update(codes)
        wins = [r for r in results if r[0] == 201]
        ok = len(wins) == 1 and all(c in (201, 409) for c in codes)
        violations += 0 if ok else 1
        print(f"round {rnd + 1:>2}: {codes}  {'OK' if ok else '<-- VIOLATION'}")

        if not args.keep:
            for r, tok in zip(results, tokens):
                if r[0] == 201:
                    call(args.base, "DELETE", f"/bookings/{r[1]['id']}", token=tok)

    print("\nstatus totals:", dict(totals))
    print("rounds violating 'exactly one winner, no 5xx':", violations)
    raise SystemExit(1 if violations else 0)


if __name__ == "__main__":
    main()
