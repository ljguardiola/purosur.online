export interface InstallationStreamReach {
  enrolledAt: Date;
  revokedAt: Date | null;
  latestOccurredAt: Date | null;
}

export function streamReachesPast(
  installations: readonly InstallationStreamReach[],
  { from, until }: { from: Date; until: Date },
): boolean {
  return installations
    .filter(
      ({ enrolledAt, revokedAt }) => enrolledAt < until && (revokedAt === null || revokedAt > from),
    )
    .every(({ latestOccurredAt }) => latestOccurredAt !== null && latestOccurredAt > until);
}
