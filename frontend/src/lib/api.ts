import type {
  BookingOut,
  Coach,
  CoachSeatMap,
  CoachType,
  FeedbackOut,
  PassengerCreate,
  PaymentMethod,
  PaymentOut,
  Route,
  RouteStopInput,
  ScheduleDetail,
  ScheduleSearchResult,
  ScheduleStatus,
  ScheduleSummary,
  SeatOut,
  SeatType,
  Station,
  TicketOut,
  Token,
  Train,
  User,
} from "./types";

type FeedbackStatus = FeedbackOut["status"];

const BASE = "/api";
const TOKEN_KEY = "railease.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Opts = {
  method?: string;
  body?: unknown;
  form?: URLSearchParams;
  auth?: boolean;
};

async function request<T>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let payload: BodyInit | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }

  const res = await fetch(BASE + path, {
    method: opts.method ?? (payload ? "POST" : "GET"),
    headers,
    body: payload,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false && getToken()) {
      setToken(null);
      window.dispatchEvent(new CustomEvent("railease:session-expired"));
    }
    const detail = data?.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg: string }) => d.msg).join("; ")
          : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  // --- auth
  register: (b: {
    name: string;
    email: string;
    phone?: string | null;
    password: string;
    date_of_birth?: string | null;
  }) => request<User>("/auth/register", { body: b, auth: false }),

  login: (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password });
    return request<Token>("/auth/login", { form, auth: false });
  },

  me: () => request<User>("/auth/me"),

  // --- catalogue
  stations: () => request<Station[]>("/stations", { auth: false }),
  trains: () => request<Train[]>("/trains", { auth: false }),

  // --- search / schedule / seat map
  search: (source: string, destination: string, journey_date: string) =>
    request<ScheduleSearchResult[]>(
      `/schedules/search?source=${encodeURIComponent(source)}&destination=${encodeURIComponent(
        destination,
      )}&journey_date=${journey_date}`,
      { auth: false },
    ),

  schedule: (id: string) =>
    request<ScheduleDetail>(`/schedules/${id}`, { auth: false }),

  seatMap: (scheduleId: string, coachType?: CoachType) =>
    request<CoachSeatMap[]>(
      `/schedules/${scheduleId}/seats${coachType ? `?coach_type=${coachType}` : ""}`,
      { auth: false },
    ),

  // --- booking / payment / ticket
  createBooking: (b: {
    schedule_id: string;
    source_station_id: string;
    destination_station_id: string;
    seat_ids: string[];
    passengers: PassengerCreate[];
  }) => request<BookingOut>("/bookings", { body: b }),

  myBookings: () => request<BookingOut[]>("/bookings/me"),
  booking: (id: string) => request<BookingOut>(`/bookings/${id}`),
  cancelBooking: (id: string) =>
    request<BookingOut>(`/bookings/${id}`, { method: "DELETE" }),

  pay: (bookingId: string, payment_method: PaymentMethod) =>
    request<PaymentOut>(`/bookings/${bookingId}/pay`, { body: { payment_method } }),

  ticket: (bookingId: string) => request<TicketOut>(`/tickets/${bookingId}`),

  // --- feedback
  myFeedback: () => request<FeedbackOut[]>("/feedback/me"),
  createFeedback: (b: {
    booking_id?: string | null;
    rating: number;
    subject?: string | null;
    message: string;
  }) => request<FeedbackOut>("/feedback", { body: b }),

  // --- reads used by the admin area
  train: (id: string) => request<Train>(`/trains/${id}`, { auth: false }),
  trainCoaches: (id: string) =>
    request<Coach[]>(`/trains/${id}/coaches`, { auth: false }),
  coachSeats: (id: string) =>
    request<SeatOut[]>(`/coaches/${id}/seats`, { auth: false }),
  route: (id: string) => request<Route>(`/routes/${id}`, { auth: false }),

  // --- admin writes (require an ADMIN token)
  adminCreateTrain: (b: {
    train_number: string;
    name: string;
    train_type?: string | null;
    status: "ACTIVE" | "INACTIVE";
  }) => request<Train>("/trains", { body: b }),

  adminCreateStation: (b: {
    station_code: string;
    name: string;
    city?: string | null;
    state?: string | null;
    status: "ACTIVE" | "INACTIVE";
  }) => request<Station>("/stations", { body: b }),

  adminCreateRoute: (b: {
    train_id: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
    stops: RouteStopInput[];
  }) => request<Route>("/routes", { body: b }),

  adminCreateSchedule: (b: {
    train_id: string;
    route_id: string;
    journey_date: string;
    departure_time: string;
    arrival_time: string;
    status: ScheduleStatus;
  }) => request<ScheduleSummary>("/schedules", { body: b }),

  adminCreateCoach: (b: {
    train_id: string;
    coach_number: string;
    coach_type: CoachType;
    seat_capacity: number;
    base_fare: number;
  }) => request<Coach>("/coaches", { body: b }),

  adminCreateSeats: (
    coachId: string,
    seats: {
      seat_number: string;
      seat_type: SeatType;
      row_number: number;
      column_number: number;
    }[],
  ) => request<SeatOut[]>(`/coaches/${coachId}/seats`, { body: { seats } }),

  adminRespondFeedback: (
    id: string,
    b: { admin_response: string; status: FeedbackStatus },
  ) => request<FeedbackOut>(`/feedback/${id}/respond`, { method: "PUT", body: b }),
};
