interface InstallationSync {
  lastAcceptedPushAt: Date | null;
}

export function installationSyncedLastOf<T extends InstallationSync>(
  installations: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const installation of installations) {
    const { lastAcceptedPushAt } = installation;
    if (
      lastAcceptedPushAt !== null &&
      (latest?.lastAcceptedPushAt == null || lastAcceptedPushAt > latest.lastAcceptedPushAt)
    ) {
      latest = installation;
    }
  }
  return latest;
}

export function lastSuccessfulSyncOfRegister(
  installations: readonly InstallationSync[],
): Date | null {
  return installationSyncedLastOf(installations)?.lastAcceptedPushAt ?? null;
}
