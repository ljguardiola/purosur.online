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

function awaitsConfirmation({ revokedAt, holdsUnappliedEvents }: InstallationStreamReach): boolean {
  return revokedAt !== null && !holdsUnappliedEvents;
}

function isConfirmed(
  installation: InstallationStreamReach,
  confirmedInstallationIds: readonly string[],
): boolean {
  return (
    awaitsConfirmation(installation) &&
    confirmedInstallationIds.includes(installation.installationId)
  );
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
      !isConfirmed(installation, confirmedInstallationIds),
  );
}

export function revokedInstallationsAwaitingConfirmation(
  installations: readonly InstallationStreamReach[],
  period: StreamPeriod,
  confirmedInstallationIds: readonly string[],
): InstallationStreamReach[] {
  return holdingBack(installations, period, confirmedInstallationIds).filter(awaitsConfirmation);
}

export function isHeldBackOnlyByRevokedInstallations(
  installations: readonly InstallationStreamReach[],
  period: StreamPeriod,
  confirmedInstallationIds: readonly string[],
): boolean {
  const blocking = holdingBack(installations, period, confirmedInstallationIds);
  return blocking.length > 0 && blocking.every(awaitsConfirmation);
}

export function streamReachesPastOnceConfirmed(
  installations: readonly InstallationStreamReach[],
  period: StreamPeriod,
  confirmedInstallationIds: readonly string[],
): boolean {
  return streamReachesPast(
    installations.filter((installation) => !isConfirmed(installation, confirmedInstallationIds)),
    period,
  );
}
