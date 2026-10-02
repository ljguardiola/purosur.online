import type { CoreStatusMessage, CoreStatusRequest } from "@purosur/contracts";
import { useEffect, useState } from "react";
import type { CoreStatusEventSource } from "./core-status";
import { attachCoreStatus } from "./core-status";

const windowMessageSource: CoreStatusEventSource = {
  addEventListener(type, listener) {
    window.addEventListener(type, listener as unknown as EventListener);
  },
  removeEventListener(type, listener) {
    window.removeEventListener(type, listener as unknown as EventListener);
  },
};

// Posted by the page once it listens for core status, so a status the preload received earlier
// still reaches it.
const CORE_STATUS_REQUEST: CoreStatusRequest = { channel: "core-status-request" };

export function useCoreStatus(): CoreStatusMessage["status"] {
  const [status, setStatus] = useState<CoreStatusMessage["status"]>("starting");

  useEffect(
    () =>
      attachCoreStatus(windowMessageSource, window, setStatus, () =>
        window.postMessage(CORE_STATUS_REQUEST, "*"),
      ),
    [],
  );

  return status;
}
