import type { CoreReadyMessage } from "@purosur/contracts";

// Sent by the core over its parentPort once it can take messages; main treats nothing short of it
// as the core being up.
export function isCoreReadyMessage(message: unknown): message is CoreReadyMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "core-ready"
  );
}
