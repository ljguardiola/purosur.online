import { argentinaInstant, type ZoneRules } from "../../shared/index.js";
import {
  type InstallationStreamReach,
  installationReachesPast,
  isInstallationActiveDuring,
  streamReachesPast,
} from "../../sync/index.js";
import { fortnightClosesAt } from "./fortnight-report.js";
import type { Fortnight } from "./offline-authorization-code.js";

export interface FortnightPeriod {
  from: Date;
  until: Date;
}

export function fortnightPeriod(fortnight: Fortnight, rules: ZoneRules): FortnightPeriod {
  return {
    from: new Date(argentinaInstant(fortnight.start, "00:00", rules)),
    until: fortnightClosesAt(fortnight, rules),
  };
}

function holdingBack(
  installations: readonly InstallationStreamReach[],
  period: FortnightPeriod,
  confirmedInstallationIds: readonly string[],
): InstallationStreamReach[] {
  return installations.filter(
    (installation) =>
      isInstallationActiveDuring(installation, period) &&
      !installationReachesPast(installation, period) &&
      !confirmedInstallationIds.includes(installation.installationId),
  );
}

export function revokedInstallationsAwaitingConfirmation(
  installations: readonly InstallationStreamReach[],
  period: FortnightPeriod,
  confirmedInstallationIds: readonly string[],
): InstallationStreamReach[] {
  return holdingBack(installations, period, confirmedInstallationIds).filter(
    ({ revokedAt }) => revokedAt !== null,
  );
}

export function isHeldBackOnlyByRevokedInstallations(
  installations: readonly InstallationStreamReach[],
  period: FortnightPeriod,
  confirmedInstallationIds: readonly string[],
): boolean {
  const blocking = holdingBack(installations, period, confirmedInstallationIds);
  return blocking.length > 0 && blocking.every(({ revokedAt }) => revokedAt !== null);
}

export function streamReachesPastOnceConfirmed(
  installations: readonly InstallationStreamReach[],
  period: FortnightPeriod,
  confirmedInstallationIds: readonly string[],
): boolean {
  return streamReachesPast(
    installations.filter(
      ({ installationId }) => !confirmedInstallationIds.includes(installationId),
    ),
    period,
  );
}
