import type { DiscountSchedule } from "./discount-status.js";
import { discountStatus } from "./discount-status.js";
import { isoWeekdayOf } from "./discount-weekdays.js";

export interface DiscountRecurrence extends DiscountSchedule {
  weekdays: readonly number[];
}

export function discountAppliesOn(discount: DiscountRecurrence, day: string): boolean {
  return (
    discountStatus(discount, day) === "current" &&
    (discount.weekdays.length === 0 || discount.weekdays.includes(isoWeekdayOf(day)))
  );
}
