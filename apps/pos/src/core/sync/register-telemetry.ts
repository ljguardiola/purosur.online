import {
  type BatteryReport,
  clockDriftReportOf,
  fiscalEmissionStoppedReportOf,
  type LatestPreEmissionGateOutcome,
  type PendingReplenishment,
  type RegisterTelemetry,
  replenishmentFailedReportOf,
  SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE,
  type SalesStopState,
  type SerialDevicesReport,
  type StorageSalesStop,
  type StorageTelemetry,
  salesDeniedReportOf,
  type ZoneRulesVersionReport,
} from "@purosur/domain";
import { registerVersionOf } from "../register/register-version";

function batteryTelemetryOf(battery: BatteryReport | undefined): { battery?: BatteryReport } {
  return battery === undefined ? {} : { battery };
}

function zoneRulesVersionReportOf(
  readZoneRulesVersion: (() => string | null) | undefined,
): ZoneRulesVersionReport {
  return readZoneRulesVersion === undefined ? {} : { zone_rules_version: readZoneRulesVersion() };
}

export function registerTelemetryReader(
  readStorage: () => Promise<StorageTelemetry>,
  readSalesStop: () => SalesStopState,
  readSerialDevices: () => SerialDevicesReport,
  readLatestPreEmissionGate: () => LatestPreEmissionGateOutcome | undefined,
  readBattery: () => BatteryReport | undefined,
  readStorageStop: () => StorageSalesStop | undefined,
  readLocalDatabaseDamaged: () => boolean = () => false,
  readBatteryCritical: () => boolean = () => false,
  readClockOffsetMs: () => number | null = () => null,
  readPendingReplenishment: () => PendingReplenishment | undefined = () => undefined,
  appVersion: string | undefined = undefined,
  readZoneRulesVersion: (() => string | null) | undefined = undefined,
): () => Promise<RegisterTelemetry> {
  return async () => ({
    ...(await readStorage()),
    ...salesDeniedReportOf(
      readSalesStop(),
      readStorageStop(),
      readLocalDatabaseDamaged(),
      readBatteryCritical(),
    ),
    ...fiscalEmissionStoppedReportOf(readLatestPreEmissionGate()),
    ...clockDriftReportOf(readClockOffsetMs()),
    ...replenishmentFailedReportOf(readPendingReplenishment(), registerVersionOf(appVersion)),
    ...zoneRulesVersionReportOf(readZoneRulesVersion),
    serial_devices: readSerialDevices(),
    ...batteryTelemetryOf(readBattery()),
  });
}

export function damagedRegisterTelemetryReader(
  readStorage: () => Promise<StorageTelemetry>,
  readBattery: () => BatteryReport | undefined,
): () => Promise<RegisterTelemetry> {
  return async () => ({
    ...(await readStorage()),
    ...SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE,
    ...batteryTelemetryOf(readBattery()),
  });
}
