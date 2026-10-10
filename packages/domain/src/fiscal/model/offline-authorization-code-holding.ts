import { isOutOfService } from "../../register/index.js";

interface CodeHoldingInstallation {
  revokedAt: Date | null;
  offlinePointOfSaleNumber: number | null;
}

export function mustHoldOfflineAuthorizationCode(installation: CodeHoldingInstallation): boolean {
  return !isOutOfService(installation) && installation.offlinePointOfSaleNumber !== null;
}
