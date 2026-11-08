interface InstallationSync {
  lastAcceptedPushAt: Date | null;
}

export function lastSuccessfulSyncOfRegister(
  installations: readonly InstallationSync[],
): Date | null {
  const acceptedPushTimes = installations.flatMap(({ lastAcceptedPushAt }) =>
    lastAcceptedPushAt === null ? [] : [lastAcceptedPushAt.getTime()],
  );
  return acceptedPushTimes.length === 0 ? null : new Date(Math.max(...acceptedPushTimes));
}
