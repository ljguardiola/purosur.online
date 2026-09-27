// main/ may not depend on packages/contracts, so this mirrors the renderer's validated wire shape
// by convention rather than a shared import.
export type CoreStatus = "starting" | "down" | "up";

export interface CoreStatusReceiver {
  postMessage(channel: string, message: { type: "core-status"; status: CoreStatus }): void;
}

const CORE_STATUS_CHANNEL = "core-status";

export function broadcastCoreStatus(receiver: CoreStatusReceiver, status: CoreStatus): void {
  receiver.postMessage(CORE_STATUS_CHANNEL, { type: "core-status", status });
}
