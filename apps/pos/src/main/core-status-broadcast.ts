import type { CoreStatusMessage } from "@purosur/contracts";

export type CoreStatus = CoreStatusMessage["status"];

export interface CoreStatusReceiver {
  postMessage(channel: string, message: CoreStatusMessage): void;
}

const CORE_STATUS_CHANNEL = "core-status";

export function broadcastCoreStatus(receiver: CoreStatusReceiver, status: CoreStatus): void {
  receiver.postMessage(CORE_STATUS_CHANNEL, { type: "core-status", status });
}
