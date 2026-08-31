import { createContext, useContext, useState, type ReactNode } from "react";
import type {
  BookingOut,
  CoachType,
  ScheduleSearchResult,
  SeatMapEntry,
} from "../lib/types";

/** A seat the customer picked, tagged with the coach it lives in and its fare. */
export type SelectedSeat = SeatMapEntry & {
  coach_id: string;
  coach_number: string;
  fare: string;
};

export interface BookingDraft {
  search: { source: string; destination: string; date: string } | null;
  result: ScheduleSearchResult | null;
  coachType: CoachType | null;
  sourceStationId: string | null;
  destStationId: string | null;
  seats: SelectedSeat[];
  booking: BookingOut | null;
}

const EMPTY: BookingDraft = {
  search: null,
  result: null,
  coachType: null,
  sourceStationId: null,
  destStationId: null,
  seats: [],
  booking: null,
};

interface Ctx {
  draft: BookingDraft;
  patch: (p: Partial<BookingDraft>) => void;
  reset: () => void;
}

const BookingCtx = createContext<Ctx | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(EMPTY);
  const patch = (p: Partial<BookingDraft>) => setDraft((d) => ({ ...d, ...p }));
  const reset = () => setDraft(EMPTY);
  return (
    <BookingCtx.Provider value={{ draft, patch, reset }}>
      {children}
    </BookingCtx.Provider>
  );
}

export function useBooking() {
  const v = useContext(BookingCtx);
  if (!v) throw new Error("useBooking outside BookingProvider");
  return v;
}
