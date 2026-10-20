import type { SaleAuthorizationTransaction } from "./sale-authorization-ports.js";

export type FiscalEmissionModeReads = Pick<
  SaleAuthorizationTransaction,
  "fiscalOnlineEvidence" | "realTimeSeries" | "offlineSeries" | "offlineAuthorizationCodeOf"
>;
