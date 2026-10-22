import { argentinaCalendarDay, lastDayOfMonth, shiftCalendarDay } from "../../shared/index.js";

const DEFERRED_SALE_INVOICING_DAYS = 5;

export function deferredSaleExpiresOn(occurredAt: Date): string {
  const saleDay = argentinaCalendarDay(occurredAt);
  const fiveDaysLater = shiftCalendarDay(saleDay, DEFERRED_SALE_INVOICING_DAYS);
  const monthEnd = lastDayOfMonth(saleDay);
  return fiveDaysLater < monthEnd ? fiveDaysLater : monthEnd;
}

export function isDeferredSaleExpired(occurredAt: Date, now: Date): boolean {
  return argentinaCalendarDay(now) > deferredSaleExpiresOn(occurredAt);
}
