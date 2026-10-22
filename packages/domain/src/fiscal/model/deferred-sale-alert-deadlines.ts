import { argentinaCalendarDay, argentinaInstant, shiftCalendarDay } from "../../shared/index.js";
import { deferredSaleExpiresOn, isDeferredSaleExpired } from "./deferred-sale-expiry.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_OPENS_DAYS_AFTER_SALE = 3;
const ALERT_ESCALATES_DAYS_AFTER_SALE = 4;
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

function alertInstant(occurredAt: Date, daysAfterSale: number, daysBeforeExpiryEnd: number): Date {
  const afterSale = startOfDay(shiftCalendarDay(argentinaCalendarDay(occurredAt), daysAfterSale));
  const expiryEnd = startOfDay(shiftCalendarDay(deferredSaleExpiresOn(occurredAt), 1));
  const beforeExpiry = new Date(expiryEnd.getTime() - daysBeforeExpiryEnd * DAY_MS);
  const earliest = afterSale.getTime() < beforeExpiry.getTime() ? afterSale : beforeExpiry;
  return earliest.getTime() < occurredAt.getTime() ? occurredAt : earliest;
}

export function deferredSaleAlertOpensAt(occurredAt: Date): Date {
  return alertInstant(occurredAt, ALERT_OPENS_DAYS_AFTER_SALE, ALERT_OPENS_DAYS_BEFORE_EXPIRY_END);
}

export function deferredSaleAlertEscalatesAt(occurredAt: Date): Date {
  return alertInstant(
    occurredAt,
    ALERT_ESCALATES_DAYS_AFTER_SALE,
    ALERT_ESCALATES_DAYS_BEFORE_EXPIRY_END,
  );
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

export function deferredSaleAgeInDays(occurredAt: Date, now: Date): number {
  const saleDay = Date.parse(`${argentinaCalendarDay(occurredAt)}T00:00:00Z`);
  const today = Date.parse(`${argentinaCalendarDay(now)}T00:00:00Z`);
  return Math.round((today - saleDay) / DAY_MS);
}
