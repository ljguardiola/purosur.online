import {
  type BatteryReport,
  fiscalEmissionStoppedReportOf,
  type LatestPreEmissionGateOutcome,
  type RegisterTelemetry,
  SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE,
  type SalesStopState,
  type SerialDevicesReport,
  type StorageSalesStop,
  type StorageTelemetry,
  salesDeniedReportOf,
} from "@purosur/domain";

function batteryTelemetryOf(battery: BatteryReport | undefined): { battery?: BatteryReport } {
  return battery === undefined ? {} : { battery };
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
