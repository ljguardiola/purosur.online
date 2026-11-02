import { revokedInstallationsAwaitingConfirmation } from "../../sync/index.js";
import { fortnightPeriod, isFortnightReportOutstanding } from "../model/fortnight-report.js";
import { fortnightContaining } from "../model/offline-authorization-code.js";
import type { ConfirmRevokedInstallationUnsyncedPorts } from "./confirm-revoked-installation-unsynced-ports.js";

export interface ConfirmRevokedInstallationUnsyncedInput {
  locationId: string;
  pointOfSaleNumber: number;
  fortnightStart: string;
  installationId: string;
  actorId: string;
}

export type ConfirmRevokedInstallationUnsyncedOutcome =
  | { kind: "not_found" }
  | { kind: "already_confirmed" }
  | { kind: "already_presented" }
  | { kind: "not_revoked" }
  | { kind: "not_holding_back" }
  | { kind: "confirmed" };

export function confirmRevokedInstallationUnsynced(
  { store, clock, zoneRules }: ConfirmRevokedInstallationUnsyncedPorts,
  {
    locationId,
    pointOfSaleNumber,
    fortnightStart,
    installationId,
    actorId,
  }: ConfirmRevokedInstallationUnsyncedInput,
): Promise<ConfirmRevokedInstallationUnsyncedOutcome> {
  const fortnight = fortnightContaining(fortnightStart);
  const key = { pointOfSaleNumber, fortnight };
  return store.transaction<ConfirmRevokedInstallationUnsyncedOutcome>(async (tx) => {
    await tx.holdFortnightPresentation(key);
    const found = await tx.installationOfReport(key, installationId, locationId);
    if (found === null) {
      return { kind: "not_found" };
    }
    const confirmed = await tx.confirmedInstallations(key);
    if (confirmed.includes(installationId)) {
      return { kind: "already_confirmed" };
    }
    if (!isFortnightReportOutstanding(await tx.recordedReportState(key))) {
      return { kind: "already_presented" };
    }
    const { installation, registerId } = found;
    if (installation.revokedAt === null) {
      return { kind: "not_revoked" };
    }
    const period = fortnightPeriod(fortnight, zoneRules.zoneRules());
    if (revokedInstallationsAwaitingConfirmation([installation], period, confirmed).length === 0) {
      return { kind: "not_holding_back" };
    }

    const at = clock.now();
    await tx.recordConfirmation({
      pointOfSaleNumber,
      fortnight,
      installationId,
      confirmedBy: actorId,
      confirmedAt: at,
    });
    await tx.recordConfirmationAudit({
      pointOfSaleNumber,
      fortnight,
      installationId,
      registerId,
      revokedAt: installation.revokedAt,
      actorId,
      at,
    });
    return { kind: "confirmed" };
  });
}
