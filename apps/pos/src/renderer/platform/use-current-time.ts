import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

// Undefined until the first effect runs, since a render must never read the clock itself.
export function useCurrentTime(): Date | undefined {
  const [now, setNow] = useState<Date>();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, MINUTE_MS - (current.getTime() % MINUTE_MS));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  return now;
}
