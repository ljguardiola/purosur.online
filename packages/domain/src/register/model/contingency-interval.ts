export function contingencyIntervalEnd(startedAt: Date, closedAt: Date): Date {
  return new Date(Math.max(startedAt.getTime(), closedAt.getTime()));
}

export function replacedRegisterContingencyEnd({
  startedAt,
  lastSeenAt,
  sessionClosedAt,
}: {
  startedAt: Date;
  lastSeenAt: Date;
  sessionClosedAt: Date | null;
}): Date {
  const lastRunning =
    sessionClosedAt === null
      ? lastSeenAt
      : new Date(Math.min(sessionClosedAt.getTime(), lastSeenAt.getTime()));
  return contingencyIntervalEnd(startedAt, lastRunning);
}
