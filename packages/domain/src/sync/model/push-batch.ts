import type { OutboxEvent } from "./outbox-event.js";

export const PUSH_BATCH_MAX_EVENTS = 200;

export type PushedEvent = OutboxEvent & { chain_hmac: string };

export interface RegisterTelemetry {
  wal_size_bytes: number;
  disk_free_bytes: number;
  disk_free_ratio: number;
}
