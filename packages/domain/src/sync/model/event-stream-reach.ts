export interface InstallationStreamReach {
  enrolledAt: Date;
  revokedAt: Date | null;
  latestOccurredAt: Date | null;
  caughtUpAt: Date | null;
  holdsUnappliedEvents: boolean;
}

export function streamReachesPast(
  installations: readonly InstallationStreamReach[],
  { from, until }: { from: Date; until: Date },
): boolean {
  return installations
    .filter(
      ({ enrolledAt, revokedAt }) => enrolledAt < until && (revokedAt === null || revokedAt > from),
    )
    .every(
      ({ latestOccurredAt, caughtUpAt, holdsUnappliedEvents }) =>
        !holdsUnappliedEvents &&
        ((latestOccurredAt !== null && latestOccurredAt > until) ||
          (caughtUpAt !== null && caughtUpAt > until)),
    );
}
