export function contingencyIntervalEnd(startedAt: Date, closedAt: Date): Date {
  return new Date(Math.max(startedAt.getTime(), closedAt.getTime()));
}
