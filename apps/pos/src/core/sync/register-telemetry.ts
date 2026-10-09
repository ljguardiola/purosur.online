import {
  type RegisterTelemetry,
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
