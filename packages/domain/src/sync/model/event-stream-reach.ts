export interface InstallationStreamReach {
  installationId: string;
  enrolledAt: Date;
  revokedAt: Date | null;
  latestOccurredAt: Date | null;
  caughtUpAt: Date | null;
  holdsUnappliedEvents: boolean;
}

export function isInstallationActiveDuring(
  { enrolledAt, revokedAt }: InstallationStreamReach,
  { from, until }: { from: Date; until: Date },
): boolean {
  return enrolledAt < until && (revokedAt === null || revokedAt > from);
}

export function installationReachesPast(
  { latestOccurredAt, caughtUpAt, holdsUnappliedEvents }: InstallationStreamReach,
  { until }: { until: Date },
): boolean {
  return (
    !holdsUnappliedEvents &&
    ((latestOccurredAt !== null && latestOccurredAt > until) ||
      (caughtUpAt !== null && caughtUpAt > until))
  );
}

export function streamReachesPast(
  installations: readonly InstallationStreamReach[],
  { from, until }: { from: Date; until: Date },
): boolean {
  return installations
    .filter((installation) => isInstallationActiveDuring(installation, { from, until }))
    .every((installation) => installationReachesPast(installation, { until }));
}
