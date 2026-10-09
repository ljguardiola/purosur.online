export type RegisterService = { kind: "in_service" } | { kind: "out_of_service" };

export interface WatchedRegister {
  registerId: string;
  deviceId: string;
  locationId: string;
  lastSuccessfulSyncAt: Date;
}

interface InstallationStanding {
  revokedAt: Date | null;
}

interface InstallationReporting extends InstallationStanding {
  reportsEveryCycleSince: Date | null;
}

export function installationService({ revokedAt }: InstallationStanding): RegisterService {
  return revokedAt === null ? { kind: "in_service" } : { kind: "out_of_service" };
}

export function isWatchedForQuietness<TInstallation extends InstallationReporting>(
  installation: TInstallation,
): installation is TInstallation & { reportsEveryCycleSince: Date } {
  return (
    installationService(installation).kind === "in_service" &&
    installation.reportsEveryCycleSince !== null
  );
}
