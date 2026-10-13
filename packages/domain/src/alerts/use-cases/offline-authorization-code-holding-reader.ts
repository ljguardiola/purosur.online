import type { Fortnight, RegisterOfflineAuthorizationCodeHolding } from "../../fiscal/index.js";

export interface OfflineAuthorizationCodeHoldingReader {
  registerHoldings(
    fortnights: readonly Fortnight[],
  ): Promise<RegisterOfflineAuthorizationCodeHolding[]>;
}
