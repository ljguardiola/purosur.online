export const CLOCK_DRIFT_TOLERANCE_MS = 60_000;

export type ClockDriftReport = { clock_drift?: undefined } | { clock_drift: boolean };

interface TimedExchange {
  askedAt: Date;
  answeredAt: Date;
  serverTime: Date;
}

export function clockOffsetMs({ askedAt, answeredAt, serverTime }: TimedExchange): number {
  const doubledOffset = 2 * serverTime.getTime() - askedAt.getTime() - answeredAt.getTime();
  return Math.floor(doubledOffset / 2);
}

export function isClockDrifted(offsetMs: number): boolean {
  return Math.abs(offsetMs) > CLOCK_DRIFT_TOLERANCE_MS;
}

export function clockDriftReportOf(offsetMs: number | null): ClockDriftReport {
  return offsetMs === null ? {} : { clock_drift: isClockDrifted(offsetMs) };
}
