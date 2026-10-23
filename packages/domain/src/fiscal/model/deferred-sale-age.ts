import { argentinaCalendarDay } from "../../shared/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function deferredSaleAgeInDays(occurredAt: Date, now: Date): number {
  const saleDay = Date.parse(`${argentinaCalendarDay(occurredAt)}T00:00:00Z`);
  const today = Date.parse(`${argentinaCalendarDay(now)}T00:00:00Z`);
  return Math.round((today - saleDay) / DAY_MS);
}
