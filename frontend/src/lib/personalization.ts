export interface RecentSearch {
  source: string;
  destination: string;
  date: string;
  at: number;
}

const KEY = "railease.recentSearches";
const MAX = 4;

export function getRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(s: Omit<RecentSearch, "at">) {
  try {
    const existing = getRecentSearches().filter(
      (r) => !(r.source === s.source && r.destination === s.destination && r.date === s.date),
    );
    const next = [{ ...s, at: Date.now() }, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const part =
    h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
