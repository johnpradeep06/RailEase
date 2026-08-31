export function inr(amount: string | number): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function durationBetween(a: string, b: string): string {
  const mins = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** whole days the arrival lands after departure, e.g. "+1d" */
export function dayOffset(dep: string, arr: string): string {
  const d1 = new Date(dep);
  const d2 = new Date(arr);
  const days = Math.floor(
    (Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate()) -
      Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate())) /
      86400000,
  );
  return days > 0 ? `+${days}d` : "";
}

export const COACH_LABEL: Record<string, string> = {
  "1AC": "AC First Class",
  "2AC": "AC 2 Tier",
  "3AC": "AC 3 Tier",
  SL: "Sleeper",
  CC: "Chair Car",
};

export const SEAT_BADGE: Record<string, string> = {
  LOWER: "LB",
  MIDDLE: "MB",
  UPPER: "UB",
  SIDE_LOWER: "SL",
  SIDE_UPPER: "SU",
  SEAT: "",
};
