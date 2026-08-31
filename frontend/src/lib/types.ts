// Mirrors backend app/schemas.py. Money fields arrive as decimal strings.

export type CoachType = "1AC" | "2AC" | "3AC" | "SL" | "CC";
export type SeatType =
  | "LOWER"
  | "MIDDLE"
  | "UPPER"
  | "SIDE_LOWER"
  | "SIDE_UPPER"
  | "SEAT";
export type SeatStatus = "AVAILABLE" | "TAKEN";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type BerthPreference =
  | "LOWER"
  | "MIDDLE"
  | "UPPER"
  | "SIDE_LOWER"
  | "SIDE_UPPER"
  | "NO_PREFERENCE";
export type BookingStatus = "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED";
export type BookingSeatStatus = "RESERVED" | "CONFIRMED" | "CANCELLED";
export type PaymentMethod = "UPI" | "CARD" | "NET_BANKING" | "WALLET";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
export type TicketStatus = "ACTIVE" | "CANCELLED";
export type ScheduleStatus = "SCHEDULED" | "CANCELLED" | "COMPLETED";

export interface User {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  date_of_birth: string | null;
  created_at: string | null;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface Station {
  id: string;
  station_code: string;
  name: string;
  city: string | null;
  state: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface Train {
  id: string;
  train_number: string;
  name: string;
  train_type: string | null;
  status: "ACTIVE" | "INACTIVE";
  created_at: string | null;
}

export interface RouteStop {
  id: string;
  station: Station;
  stop_sequence: number;
  arrival_time: string | null;
  departure_time: string | null;
  day_offset: number;
}

export interface Route {
  id: string;
  train_id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  stops: RouteStop[];
}

export interface CoachAvailability {
  coach_type: CoachType;
  base_fare: string;
  total_seats: number;
  available_seats: number;
}

export interface ScheduleSearchResult {
  id: string;
  train: Train;
  journey_date: string;
  departure_time: string;
  arrival_time: string;
  status: ScheduleStatus;
  coach_availability: CoachAvailability[];
}

export interface ScheduleDetail {
  id: string;
  train_id: string;
  route_id: string;
  journey_date: string;
  departure_time: string;
  arrival_time: string;
  status: ScheduleStatus;
  train: Train;
  route: Route;
}

export interface Coach {
  id: string;
  train_id: string;
  coach_number: string;
  coach_type: CoachType;
  seat_capacity: number;
  base_fare: string;
}

export interface RouteStopInput {
  station_id: string;
  stop_sequence: number;
  arrival_time: string | null;
  departure_time: string | null;
  day_offset: number;
}

export interface ScheduleSummary {
  id: string;
  train_id: string;
  route_id: string;
  journey_date: string;
  departure_time: string;
  arrival_time: string;
  status: ScheduleStatus;
}

export interface SeatMapEntry {
  id: string;
  seat_number: string;
  seat_type: SeatType;
  row_number: number;
  column_number: number;
  status: SeatStatus;
}

export interface CoachSeatMap {
  coach_id: string;
  coach_number: string;
  coach_type: CoachType;
  base_fare: string;
  seats: SeatMapEntry[];
}

export interface PassengerCreate {
  name: string;
  date_of_birth: string | null;
  gender: Gender;
  berth_preference: BerthPreference;
  email: string | null;
  phone: string | null;
}

export interface PassengerOut extends PassengerCreate {
  id: string;
}

export interface SeatOut {
  id: string;
  coach_id: string;
  seat_number: string;
  seat_type: SeatType;
  row_number: number;
  column_number: number;
}

export interface BookingSeatOut {
  id: string;
  seat: SeatOut;
  passenger_id: string;
  fare: string;
  status: BookingSeatStatus;
}

export interface BookingOut {
  id: string;
  booking_reference: string;
  user_id: string;
  schedule_id: string;
  source_station_id: string;
  destination_station_id: string;
  booking_date: string | null;
  total_amount: string;
  status: BookingStatus;
  passengers: PassengerOut[];
  booking_seats: BookingSeatOut[];
}

export interface PaymentOut {
  id: string;
  booking_id: string;
  payment_reference: string;
  amount: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  transaction_time: string | null;
}

export interface TicketOut {
  id: string;
  booking_id: string;
  ticket_number: string;
  ticket_status: TicketStatus;
  pdf_url: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
}

export interface FeedbackOut {
  id: string;
  user_id: string;
  booking_id: string | null;
  rating: number;
  subject: string | null;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  admin_response: string | null;
  created_at: string | null;
}
