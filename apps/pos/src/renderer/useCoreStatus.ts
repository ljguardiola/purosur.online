import { useEffect, useState } from "react";
import type { CoreStatusEventSource } from "./core-status";
import { attachCoreStatus } from "./core-status";

// Adapts the DOM's `window` to attachCoreStatus's generic event source, exactly as main.tsx does
// for attachIncomingPort: real MessageEvents carry more than the DOM's generic Event type knows.
const windowMessageSource: CoreStatusEventSource = {
  addEventListener(type, listener) {
    window.addEventListener(type, listener as unknown as EventListener);
  },
  removeEventListener(type, listener) {
    window.removeEventListener(type, listener as unknown as EventListener);
  },
};

// Assumed up until main says otherwise: main only ever broadcasts "down" once bounded restarts
// are exhausted, so a register that starts cleanly never shows the notice while waiting to hear
// from main for the first time.
export function useCoreStatus(): "down" | "up" {
  const [status, setStatus] = useState<"down" | "up">("up");

  useEffect(() => attachCoreStatus(windowMessageSource, window, setStatus), []);

  return status;
}
