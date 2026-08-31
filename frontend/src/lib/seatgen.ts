import type { CoachType, SeatType } from "./types";

export interface GenSeat {
  seat_number: string;
  seat_type: SeatType;
  row_number: number;
  column_number: number;
}

// Per-bay berth layout, roughly matching real Indian coaches:
//  3AC / SL — 8 per bay (LB/MB/UB ×2 + SLB/SUB)
//  2AC      — 6 per bay (LB/UB ×2 + SLB/SUB)
//  1AC      — 4 per cabin (LB/UB ×2)
//  CC       — handled separately: rows of 6 (3 + aisle + 3)
const BAY: Record<Exclude<CoachType, "CC">, SeatType[]> = {
  "1AC": ["LOWER", "UPPER", "LOWER", "UPPER"],
  "2AC": ["LOWER", "UPPER", "LOWER", "UPPER", "SIDE_LOWER", "SIDE_UPPER"],
  "3AC": ["LOWER", "MIDDLE", "UPPER", "LOWER", "MIDDLE", "UPPER", "SIDE_LOWER", "SIDE_UPPER"],
  SL: ["LOWER", "MIDDLE", "UPPER", "LOWER", "MIDDLE", "UPPER", "SIDE_LOWER", "SIDE_UPPER"],
};

export function generateSeats(
  coachType: CoachType,
  capacity: number,
  coachNumber: string,
): GenSeat[] {
  const out: GenSeat[] = [];
  if (coachType === "CC") {
    const perRow = 6;
    for (let i = 0; i < capacity; i++) {
      const row = Math.floor(i / perRow) + 1;
      const col = (i % perRow) + 1;
      out.push({
        seat_number: `${coachNumber}-${row}${"ABCDEF"[col - 1]}`,
        seat_type: "SEAT",
        row_number: row,
        column_number: col,
      });
    }
  } else {
    const bay = BAY[coachType];
    const perBay = bay.length;
    for (let i = 0; i < capacity; i++) {
      const row = Math.floor(i / perBay) + 1;
      const col = (i % perBay) + 1;
      out.push({
        seat_number: `${coachNumber}-${i + 1}`,
        seat_type: bay[col - 1],
        row_number: row,
        column_number: col,
      });
    }
  }
  return out;
}
