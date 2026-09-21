// Posted by the page once it listens for core status, so a status the preload received earlier
// still reaches it.
export const CORE_STATUS_REQUEST = { channel: "core-status-request" } as const;

export function isCoreStatusRequest(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "channel" in data &&
    data.channel === CORE_STATUS_REQUEST.channel
  );
}
