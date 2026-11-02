import {
  type InstallationStreamReach,
  installationReachesPast,
  isInstallationActiveDuring,
  streamReachesPast,
} from "./event-stream-reach.js";

interface StreamPeriod {
  from: Date;
  until: Date;
}

function holdingBack(
  installations: readonly InstallationStreamReach[],
  period: StreamPeriod,
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
  period: StreamPeriod,
  confirmedInstallationIds: readonly string[],
): InstallationStreamReach[] {
  return holdingBack(installations, period, confirmedInstallationIds).filter(
    ({ revokedAt }) => revokedAt !== null,
  );
}

export function isHeldBackOnlyByRevokedInstallations(
  installations: readonly InstallationStreamReach[],
  period: StreamPeriod,
  confirmedInstallationIds: readonly string[],
): boolean {
  const blocking = holdingBack(installations, period, confirmedInstallationIds);
  return blocking.length > 0 && blocking.every(({ revokedAt }) => revokedAt !== null);
}

export function streamReachesPastOnceConfirmed(
  installations: readonly InstallationStreamReach[],
  period: StreamPeriod,
  confirmedInstallationIds: readonly string[],
): boolean {
  return streamReachesPast(
    installations.filter(
      ({ installationId }) => !confirmedInstallationIds.includes(installationId),
    ),
    period,
  );
}
