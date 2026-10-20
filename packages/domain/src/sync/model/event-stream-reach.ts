export interface InstallationStreamReach {
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

export function streamReachesPast(
  installations: readonly InstallationStreamReach[],
  { from, until }: { from: Date; until: Date },
): boolean {
  return installations
    .filter((installation) => isInstallationActiveDuring(installation, { from, until }))
    .every(
      ({ latestOccurredAt, caughtUpAt, holdsUnappliedEvents }) =>
        !holdsUnappliedEvents &&
        ((latestOccurredAt !== null && latestOccurredAt > until) ||
          (caughtUpAt !== null && caughtUpAt > until)),
    );
}
