import { useEffect, useState } from "react";

type Wait = { seconds: number };

// A wait object of its own restarts the count, even when its length repeats the previous one.
export function useCountdown(wait: Wait | undefined): number {
  const [counting, setCounting] = useState({ wait, left: wait?.seconds ?? 0 });

  if (counting.wait !== wait) {
    setCounting({ wait, left: wait?.seconds ?? 0 });
  }

  useEffect(() => {
    if (wait === undefined) {
      return;
    }
    const timer = setInterval(() => {
      setCounting((current) =>
        current.left === 0 ? current : { wait: current.wait, left: current.left - 1 },
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [wait]);

  return counting.wait === wait ? counting.left : (wait?.seconds ?? 0);
}
