import type { Fortnight } from "../../fiscal/index.js";

export interface RegisterOfflineAuthorizationCodeHolding {
  registerId: string;
  deviceId: string;
  heldFortnightStarts: readonly string[];
}

export interface OfflineAuthorizationCodeHoldingReader {
  watchedRegisterHoldings(
    fortnights: readonly Fortnight[],
  ): Promise<RegisterOfflineAuthorizationCodeHolding[]>;
  scopesOfOpenMissingCodeAlerts(): Promise<string[]>;
}
