import {
  fiscalEmissionStoppedReportOf,
  type LatestPreEmissionGateOutcome,
  type RegisterTelemetry,
  SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE,
  type SalesStopState,
  type SerialDevicesReport,
  type StorageTelemetry,
  salesDeniedReportOf,
} from "@purosur/domain";

export function registerTelemetryReader(
  readStorage: () => Promise<StorageTelemetry>,
  readSalesStop: () => SalesStopState,
  readSerialDevices: () => SerialDevicesReport,
  readLatestPreEmissionGate: () => LatestPreEmissionGateOutcome | undefined,
): () => Promise<RegisterTelemetry> {
  return async () => ({
    ...(await readStorage()),
    ...salesDeniedReportOf(readSalesStop()),
    ...fiscalEmissionStoppedReportOf(readLatestPreEmissionGate()),
    serial_devices: readSerialDevices(),
  });
}

export function damagedRegisterTelemetryReader(
  readStorage: () => Promise<StorageTelemetry>,
): () => Promise<RegisterTelemetry> {
  return async () => ({ ...(await readStorage()), ...SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE });
}
