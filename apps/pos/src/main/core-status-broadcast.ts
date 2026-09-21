// main/ may not depend on packages/contracts (see main-process-scope in .dependency-cruiser.mjs),
// so this mirrors the wire shape coreStatusMessageSchema validates on the renderer's side
// (apps/pos/src/renderer/core-status.ts) by convention rather than by a shared import.
export type CoreStatus = "down" | "up";

export interface CoreStatusReceiver {
  postMessage(channel: string, message: { type: "core-status"; status: CoreStatus }): void;
}

const CORE_STATUS_CHANNEL = "core-status";

export function broadcastCoreStatus(receiver: CoreStatusReceiver, status: CoreStatus): void {
  receiver.postMessage(CORE_STATUS_CHANNEL, { type: "core-status", status });
}
