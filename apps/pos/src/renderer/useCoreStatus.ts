import type { CoreStatusMessage } from "@purosur/contracts";
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

export function useCoreStatus(): CoreStatusMessage["status"] {
  const [status, setStatus] = useState<CoreStatusMessage["status"]>("starting");

  useEffect(() => attachCoreStatus(windowMessageSource, window, setStatus), []);

  return status;
}
