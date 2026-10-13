import type { FiscalEmissionStoppedReport } from "../../fiscal/index.js";
import type { BatteryReport, SerialDevicesReport } from "../../register/index.js";
import type { OutboxEvent, SalesDeniedReport } from "../../shared/index.js";

export const PUSH_BATCH_MAX_EVENTS = 200;

export type PushedEvent = OutboxEvent & { chain_hmac: string };

export interface StorageTelemetry {
  wal_size_bytes: number;
  disk_free_bytes: number;
  disk_free_ratio: number;
}

export type RegisterTelemetry = StorageTelemetry &
  SalesDeniedReport &
  FiscalEmissionStoppedReport & {
    serial_devices?: SerialDevicesReport | undefined;
    battery?: BatteryReport | undefined;
  };
