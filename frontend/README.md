# RailEase frontend

Vite + React + TypeScript + Tailwind v4. Talks to the IRCTC FastAPI backend.
Responsive: top nav on desktop, bottom tab bar on mobile.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Requests go to `/api/*` and the Vite dev server proxies them to the backend
(`vite.config.ts`) — no CORS setup in dev. Default target is the deployed
backend. Point elsewhere:

```bash
VITE_API_TARGET=http://localhost:8000 npm run dev
```

Demo login: `user@railease.test` / `user12345`.

## Build

```bash
npm run build      # tsc -b && vite build  ->  dist/
```

Serve `dist/` with the API reachable at `/api` (reverse proxy), or change
`BASE` in `src/lib/api.ts` to the API origin and add that frontend origin to
the backend's `FRONTEND_ORIGINS`.

## Image placeholders

Every spot that needs a photo renders `<ImagePlaceholder label="…" />` — a
dashed, labelled box with the right aspect ratio. Find them by the
`data-image-placeholder` attribute or by searching for `ImagePlaceholder`.
Replace each with:

```tsx
<div className="placeholder-img" style={{ aspectRatio: "16/10" }}>
  <img src="/img/mumbai.jpg" alt="Mumbai" className="h-full w-full object-cover" />
</div>
```

Current placeholders: Home hero, Home "Explore routes" cards (×4), Search
illustration, Login brand panel.

## Structure

| Path | What |
|---|---|
| `src/lib/api.ts` | typed client for every backend endpoint; JWT in `localStorage`; emits `railease:session-expired` on 401 |
| `src/lib/types.ts` | TS mirror of `backend/app/schemas.py` |
| `src/lib/personalization.ts` | recent searches (localStorage) + time-of-day greeting |
| `src/auth/AuthContext.tsx` | login / register / me / logout; session-expiry state |
| `src/booking/BookingContext.tsx` | wizard state across the booking steps |
| `src/components/Layout.tsx` | responsive nav — desktop top bar + user menu, mobile bottom tabs |
| `src/components/SlotCard.tsx` | availability card (title, bar, `N of M free`, selected badge) — shared by the coach list and bay list |
| `src/components/SeatMap.tsx` | bay overview → tap a bay → its seat grid. Berth coaches use real `row_number` bays (8 berths); chair cars chunk rows into blocks of 3 (~18 seats). |

**Seat selection is 3 levels** (`SeatSelect.tsx` + `SeatMap.tsx`): **coach** (grid of `SlotCard`s, one per coach of the chosen class, with live free-seat counts) → **bay** (grid of `SlotCard`s) → **seat grid**. Selections may span coaches (cap 6); each carries its `coach_number` + `fare` (`SelectedSeat` in `BookingContext`). All counts derived client-side from `/schedules/{id}/seats` — no schema change.
| `src/components/ImagePlaceholder.tsx` | drop-in image slot |
| `src/components/Stepper.tsx` | full stepper on desktop, progress bar on mobile |
| `src/pages/*` | Home, Login, Search (`/book`), Results, SeatSelect, Passengers, Payment, Confirmation, MyTrips, TripDetail, Feedback, Account |
| `src/pages/admin/*` | `/admin` — role-gated (`user.role === "ADMIN"`) |

## Admin panel (`/admin`)

Shown in the nav / user menu only for admin accounts. Implements exactly what
the backend exposes — the landing page is a capability matrix:

| Requested feature | In panel | Endpoint |
|---|---|---|
| Admin login | ✅ | same `/auth/login`, role from `/auth/me` |
| Admin register | ❌ | none — promote a user in the DB |
| Create train | ✅ | `POST /trains` |
| Update / delete / deactivate train | ❌ | no such routes |
| Manage stations | ⚠️ create + list | `POST /stations`, `GET /stations` |
| Manage routes & stops | ⚠️ create + view-by-id | `POST /routes`, `GET /routes/{id}` |
| Manage coaches & seats | ⚠️ create coach, list per train, bulk-generate seats | `POST /coaches`, `GET /trains/{id}/coaches`, `POST|GET /coaches/{id}/seats` |
| Create schedule | ✅ | `POST /schedules` |
| View / manage all bookings | ⚠️ look-up-by-id + cancel | `GET|DELETE /bookings/{id}` (admin can act on any) |
| Manage users | ❌ | no user endpoints |
| Manage feedback | ⚠️ respond-by-id | `PUT /feedback/{id}/respond` |

Seed admin: `admin@railease.test` / `admin12345`.

## Personalization & session

- Home greets by name + time of day, surfaces your next upcoming trip and
  recent searches.
- 401 from any authed call clears the token, flags the session expired, and
  bounces to `/login`, which returns you to where you were after sign-in.
- `MyTrips` filters: All / Upcoming / Past / Cancelled.

## Flow

`Login → Home → Search (/schedules/search) → Results (pick class) → SeatSelect
(/schedules/{id}/seats + boarding/dropping from route stops) → Passengers
(POST /bookings) → Payment (POST /bookings/{id}/pay) → Confirmation
(/tickets/{booking_id})`. A `400 "Seat(s) no longer available"` on booking
sends the user back to the seat map.
