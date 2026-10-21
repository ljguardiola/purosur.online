import type { LatestPreEmissionGateOutcome } from "../model/fiscal-emission-stop.js";
import type { SaleAuthorizationTransaction } from "./sale-authorization-ports.js";

export interface FiscalEmissionModeReads
  extends Pick<
    SaleAuthorizationTransaction,
    "fiscalOnlineEvidence" | "realTimeSeries" | "offlineSeries" | "offlineAuthorizationCodeOf"
  > {
  latestPreEmissionGateOutcome(): LatestPreEmissionGateOutcome | undefined;
}
