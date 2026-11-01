import { type ReportPeriod, shiftCalendarDay } from "../../shared/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysToExpiry(expiresOn: string, today: string): number {
  return Math.round(
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
}

export function isExpired(expiresOn: string, today: string): boolean {
  return expiresOn < today;
}

export function expiryWindowEnd(today: string, windowDays: number): string {
  return shiftCalendarDay(today, windowDays);
}

export function expiryReportPeriodOf(
  { from, to }: { from?: string; to?: string },
  today: string,
  windowDays: number,
): ReportPeriod {
  return from !== undefined && to !== undefined
    ? { from, to }
    : { from: today, to: expiryWindowEnd(today, windowDays) };
}

export function canExpireWithStock<
  Lot extends { expiresOn: string | null; technical: boolean; remaining: number },
>(lot: Lot): lot is Lot & { expiresOn: string } {
  return lot.expiresOn !== null && !lot.technical && lot.remaining > 0;
}

export function lotShelfLifeDays(createdOn: string, expiresOn: string): number {
  return Math.max(0, daysToExpiry(expiresOn, createdOn));
}

export function countsForShelfLife<
  Lot extends {
    expiresOn: string | null;
    origin: "purchase" | "assembly_batch" | "initial_count" | "technical";
    batchVoided: boolean;
  },
>(lot: Lot): lot is Lot & { expiresOn: string } {
  return (
    lot.expiresOn !== null &&
    (lot.origin === "purchase" || (lot.origin === "assembly_batch" && !lot.batchVoided))
  );
}
