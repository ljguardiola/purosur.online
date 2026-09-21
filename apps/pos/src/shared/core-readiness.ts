// Sent by the core over its parentPort once it can take messages; main treats nothing short of it
// as the core being up.
export const CORE_READY_MESSAGE = { type: "core-ready" } as const;

export function isCoreReadyMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === CORE_READY_MESSAGE.type
  );
}
