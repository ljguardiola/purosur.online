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

// Preload relays main's core-status broadcast the same way it relays the core-port handoff: by
// posting to this same window. A hostile or buggy sender could still post anything on this
// channel, so the payload is validated against the same schema packages/contracts hands the core
// process, and anything that doesn't parse is dropped rather than trusted.
export function attachCoreStatus(
  source: CoreStatusEventSource,
  ownWindow: unknown,
  onStatus: (status: CoreStatusMessage["status"]) => void,
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
  return () => source.removeEventListener("message", handleMessage);
}
