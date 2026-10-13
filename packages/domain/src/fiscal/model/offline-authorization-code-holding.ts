import { isOutOfService } from "../../register/index.js";

export interface RegisterOfflineAuthorizationCodeHolding {
  registerId: string;
  deviceId: string;
  heldFortnightStarts: readonly string[];
}

interface CodeHoldingInstallation {
  revokedAt: Date | null;
  offlinePointOfSaleNumber: number | null;
}

export function mustHoldOfflineAuthorizationCode(installation: CodeHoldingInstallation): boolean {
  return !isOutOfService(installation) && installation.offlinePointOfSaleNumber !== null;
}
