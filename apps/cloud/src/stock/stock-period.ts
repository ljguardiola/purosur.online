import { STOCK_PERIOD_DAYS, type StockPeriodDays } from "@purosur/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS: StockPeriodDays = 30;

export function periodStart(days: unknown, now: Date): Date {
  const offered = STOCK_PERIOD_DAYS.find((option) => String(option) === days);
  return new Date(now.getTime() - (offered ?? DEFAULT_PERIOD_DAYS) * DAY_MS);
}
