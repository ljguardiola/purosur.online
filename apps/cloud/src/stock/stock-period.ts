import { stockPeriodSchema } from "@purosur/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

export function periodStart(days: unknown, now: Date): Date {
  return new Date(now.getTime() - Number(stockPeriodSchema.parse(days)) * DAY_MS);
}
