import { isOutOfService } from "../../register/index.js";
import type { Fortnight } from "./offline-authorization-code.js";

export interface RegisterOfflineAuthorizationCodeHolding {
  registerId: string;
  deviceId: string;
  heldFortnightStarts: readonly string[];
}

export interface OfflineAuthorizationCodeHoldingReader {
  registerHoldings(
    fortnights: readonly Fortnight[],
  ): Promise<RegisterOfflineAuthorizationCodeHolding[]>;
}

interface CodeHoldingInstallation {
  revokedAt: Date | null;
  offlinePointOfSaleNumber: number | null;
}

export function mustHoldOfflineAuthorizationCode(installation: CodeHoldingInstallation): boolean {
  return !isOutOfService(installation) && installation.offlinePointOfSaleNumber !== null;
}
