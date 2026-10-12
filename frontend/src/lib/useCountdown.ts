import { useEffect, useState } from "react";

/** Seconds left until `deadline` (ISO string), ticking every second. */
export function useCountdown(deadline: string | null | undefined) {
  const target = deadline ? new Date(deadline).getTime() : null;
  const calc = () =>
    target === null ? null : Math.max(0, Math.round((target - Date.now()) / 1000));
  const [secs, setSecs] = useState<number | null>(calc);

  useEffect(() => {
    setSecs(calc());
    if (target === null) return;
    const id = setInterval(() => setSecs(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const mm = secs === null ? "--" : String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = secs === null ? "--" : String(secs % 60).padStart(2, "0");
  return { secs, label: `${mm}:${ss}`, expired: secs !== null && secs <= 0 };
}
