import { DEFAULT_STOCK_PERIOD_DAYS, STOCK_PERIOD_DAYS } from "@purosur/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

export function periodStart(days: unknown, now: Date): Date {
  const offered = STOCK_PERIOD_DAYS.find((option) => String(option) === days);
  return new Date(now.getTime() - (offered ?? DEFAULT_STOCK_PERIOD_DAYS) * DAY_MS);
}
