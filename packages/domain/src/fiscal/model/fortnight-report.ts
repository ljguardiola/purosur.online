import { argentinaInstant, shiftCalendarDay } from "../../shared/index.js";
import type { Fortnight } from "./offline-authorization-code.js";

export type FortnightReportState = "blocked" | "submitting" | "refused" | "accepted";

export type FortnightReportStanding =
  | { kind: "not_due" }
  | { kind: "pending"; daysLeft: number; pressing: boolean }
  | { kind: "missed" };

export const FORTNIGHT_REPORT_RETRY_INTERVAL_MS = 60 * 60 * 1000;

const DAYS_TO_REPORT_AFTER_CLOSE = 8;
const PRESSING_DAYS_LEFT = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export function fortnightClosesAt({ end }: Fortnight): Date {
  return new Date(argentinaInstant(shiftCalendarDay(end, 1), "00:00"));
}

export function fortnightReportDeadline(
  fortnight: Fortnight,
  taxAuthorityDeadline: string,
): string {
  const eighthDay = shiftCalendarDay(fortnight.end, DAYS_TO_REPORT_AFTER_CLOSE);
  return [taxAuthorityDeadline, eighthDay].sort()[0] ?? eighthDay;
}

function hasFortnightClosed({ end }: Fortnight, today: string): boolean {
  return end < today;
}

export function owesFortnightReport(
  { fortnight, claimedAt }: { fortnight: Fortnight; claimedAt: Date },
  today: string,
): boolean {
  return hasFortnightClosed(fortnight, today) && claimedAt < fortnightClosesAt(fortnight);
}

export function isFortnightReportOutstanding(state: FortnightReportState | null): boolean {
  return state !== "accepted";
}

export function fortnightReportStanding(
  report: { fortnight: Fortnight; deadline: string; state: FortnightReportState | null },
  today: string,
): FortnightReportStanding {
  if (!isFortnightReportOutstanding(report.state) || !hasFortnightClosed(report.fortnight, today)) {
    return { kind: "not_due" };
  }
  if (today > report.deadline) {
    return { kind: "missed" };
  }
  const daysLeft = Math.round(
    (Date.parse(`${report.deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
  return { kind: "pending", daysLeft, pressing: daysLeft <= PRESSING_DAYS_LEFT };
}

export function isFortnightReportRetryDue(lastAttemptAt: Date, now: Date): boolean {
  return now.getTime() - lastAttemptAt.getTime() >= FORTNIGHT_REPORT_RETRY_INTERVAL_MS;
}
