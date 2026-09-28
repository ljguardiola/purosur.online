import type { CoreStatusMessage } from "@purosur/contracts";
import { coreStatusMessageSchema } from "@purosur/contracts";

export interface CoreStatusEvent {
  source: unknown;
  data: unknown;
}

export interface CoreStatusEventSource {
  addEventListener(type: "message", listener: (event: CoreStatusEvent) => void): void;
  removeEventListener(type: "message", listener: (event: CoreStatusEvent) => void): void;
}

const CORE_STATUS_CHANNEL = "core-status";

function payloadOf(data: unknown): unknown {
  if (typeof data !== "object" || data === null || !("channel" in data) || !("payload" in data)) {
    return undefined;
  }
  return data.channel === CORE_STATUS_CHANNEL ? data.payload : undefined;
}

// A hostile or buggy sender could post anything on window's message channel, so the payload is
// validated against the core-status schema; anything that fails to parse is dropped.
export function attachCoreStatus(
  source: CoreStatusEventSource,
  ownWindow: unknown,
  onStatus: (status: CoreStatusMessage["status"]) => void,
  requestStatus: () => void,
): () => void {
  const handleMessage = (event: CoreStatusEvent): void => {
    if (event.source !== ownWindow) {
      return;
    }

    const result = coreStatusMessageSchema.safeParse(payloadOf(event.data));
    if (!result.success) {
      return;
    }

    onStatus(result.data.status);
  };

  source.addEventListener("message", handleMessage);
  requestStatus();
  return () => source.removeEventListener("message", handleMessage);
}
