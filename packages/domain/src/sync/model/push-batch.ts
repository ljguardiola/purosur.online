import type { SerialDeviceRole, SerialDeviceStanding } from "../../register/index.js";
import type { OutboxEvent, SalesDeniedReport } from "../../shared/index.js";

export const PUSH_BATCH_MAX_EVENTS = 200;

export type PushedEvent = OutboxEvent & { chain_hmac: string };

export interface StorageTelemetry {
  wal_size_bytes: number;
  disk_free_bytes: number;
  disk_free_ratio: number;
}

export const SERIAL_DEVICE_REPORT_STANDINGS = [
  "matching",
  "not_detected",
  "mismatched",
  "not_registered",
  "unknown",
] as const satisfies readonly (SerialDeviceStanding["kind"] | "unknown")[];

export type SerialDeviceReport = {
  standing: (typeof SERIAL_DEVICE_REPORT_STANDINGS)[number];
} & ({ vendor_id: string; product_id: string } | { vendor_id?: undefined; product_id?: undefined });

export type SerialDevicesReport = Record<SerialDeviceRole, SerialDeviceReport>;

export type RegisterTelemetry = StorageTelemetry &
  SalesDeniedReport & { serial_devices?: SerialDevicesReport | undefined };
