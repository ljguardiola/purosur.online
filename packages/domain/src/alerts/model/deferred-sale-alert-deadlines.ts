import { deferredSaleExpiresOn, isDeferredSaleExpired } from "../../fiscal/index.js";
import { argentinaInstant, shiftCalendarDay, type ZoneRules } from "../../shared/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_OPENS_DAYS_BEFORE_EXPIRY_END = 3;
const ALERT_ESCALATES_DAYS_BEFORE_EXPIRY_END = 2;

export type DeferredSaleStanding =
  | { kind: "quiet" }
  | { kind: "due" }
  | { kind: "pressing" }
  | { kind: "expired" };

function startOfDay(day: string, rules: ZoneRules): Date {
  return new Date(argentinaInstant(day, "00:00", rules));
}

function alertInstant(occurredAt: Date, daysBeforeExpiryEnd: number, rules: ZoneRules): Date {
  const expiryEnd = startOfDay(
    shiftCalendarDay(deferredSaleExpiresOn(occurredAt, rules), 1),
    rules,
  );
  return new Date(
    Math.max(occurredAt.getTime(), expiryEnd.getTime() - daysBeforeExpiryEnd * DAY_MS),
  );
}

export function deferredSaleAlertOpensAt(occurredAt: Date, rules: ZoneRules): Date {
  return alertInstant(occurredAt, ALERT_OPENS_DAYS_BEFORE_EXPIRY_END, rules);
}

export function deferredSaleAlertEscalatesAt(occurredAt: Date, rules: ZoneRules): Date {
  return alertInstant(occurredAt, ALERT_ESCALATES_DAYS_BEFORE_EXPIRY_END, rules);
}

export function deferredSaleStanding(
  occurredAt: Date,
  now: Date,
  rules: ZoneRules,
): DeferredSaleStanding {
  if (isDeferredSaleExpired(occurredAt, now, rules)) {
    return { kind: "expired" };
  }
  if (now.getTime() >= deferredSaleAlertEscalatesAt(occurredAt, rules).getTime()) {
    return { kind: "pressing" };
  }
  if (now.getTime() >= deferredSaleAlertOpensAt(occurredAt, rules).getTime()) {
    return { kind: "due" };
  }
  return { kind: "quiet" };
}
