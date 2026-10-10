import {
  type RegisterTelemetry,
  SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE,
  type SalesStopState,
  type StorageTelemetry,
  salesDeniedReportOf,
} from "@purosur/domain";

export function registerTelemetryReader(
  readStorage: () => Promise<StorageTelemetry>,
  readSalesStop: () => SalesStopState,
): () => Promise<RegisterTelemetry> {
  return async () => ({
    ...(await readStorage()),
    ...salesDeniedReportOf(readSalesStop()),
  });
}

export function damagedRegisterTelemetryReader(
  readStorage: () => Promise<StorageTelemetry>,
): () => Promise<RegisterTelemetry> {
  return async () => ({ ...(await readStorage()), ...SALES_DENIED_FOR_DAMAGED_LOCAL_DATABASE });
}
