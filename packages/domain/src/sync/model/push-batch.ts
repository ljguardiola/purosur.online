import type { OutboxEvent, SalesDeniedReport } from "../../shared/index.js";

export const PUSH_BATCH_MAX_EVENTS = 200;

export type PushedEvent = OutboxEvent & { chain_hmac: string };

export interface StorageTelemetry {
  wal_size_bytes: number;
  disk_free_bytes: number;
  disk_free_ratio: number;
}

export type RegisterTelemetry = StorageTelemetry & SalesDeniedReport;
