import type { FiscalEmissionStoppedReport } from "../../fiscal/index.js";
import type {
  BatteryReport,
  ClockDriftReport,
  SalesDeniedReport,
  SerialDevicesReport,
  ZoneRulesVersionReport,
} from "../../register/index.js";
import type { ReplenishmentFailedReport } from "./replenishment-failure.js";

export const PUSH_BATCH_MAX_EVENTS = 200;

export interface StorageTelemetry {
  wal_size_bytes: number;
  disk_free_bytes: number;
  disk_free_ratio: number;
}

export type RegisterTelemetry = StorageTelemetry &
  SalesDeniedReport &
  FiscalEmissionStoppedReport &
  ClockDriftReport &
  ReplenishmentFailedReport &
  ZoneRulesVersionReport & {
    serial_devices?: SerialDevicesReport | undefined;
    battery?: BatteryReport | undefined;
  };
