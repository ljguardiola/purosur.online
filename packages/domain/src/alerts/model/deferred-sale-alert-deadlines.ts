import { deferredSaleExpiresOn, isDeferredSaleExpired } from "../../fiscal/index.js";
import { argentinaInstant, shiftCalendarDay } from "../../shared/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_OPENS_DAYS_BEFORE_EXPIRY_END = 3;
const ALERT_ESCALATES_DAYS_BEFORE_EXPIRY_END = 2;

export type DeferredSaleStanding =
  | { kind: "quiet" }
  | { kind: "due" }
  | { kind: "pressing" }
  | { kind: "expired" };

function startOfDay(day: string): Date {
  return new Date(argentinaInstant(day, "00:00"));
}

function alertInstant(occurredAt: Date, daysBeforeExpiryEnd: number): Date {
  const expiryEnd = startOfDay(shiftCalendarDay(deferredSaleExpiresOn(occurredAt), 1));
  return new Date(
    Math.max(occurredAt.getTime(), expiryEnd.getTime() - daysBeforeExpiryEnd * DAY_MS),
  );
}

export function deferredSaleAlertOpensAt(occurredAt: Date): Date {
  return alertInstant(occurredAt, ALERT_OPENS_DAYS_BEFORE_EXPIRY_END);
}

export function deferredSaleAlertEscalatesAt(occurredAt: Date): Date {
  return alertInstant(occurredAt, ALERT_ESCALATES_DAYS_BEFORE_EXPIRY_END);
}

export function deferredSaleStanding(occurredAt: Date, now: Date): DeferredSaleStanding {
  if (isDeferredSaleExpired(occurredAt, now)) {
    return { kind: "expired" };
  }
  if (now.getTime() >= deferredSaleAlertEscalatesAt(occurredAt).getTime()) {
    return { kind: "pressing" };
  }
  if (now.getTime() >= deferredSaleAlertOpensAt(occurredAt).getTime()) {
    return { kind: "due" };
  }
  return { kind: "quiet" };
}
