import { useEffect, useState } from 'react';

/** Re-renders every `ms` so relative times ("2m ago", call timers) stay fresh. `ms <= 0` stops ticking. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
