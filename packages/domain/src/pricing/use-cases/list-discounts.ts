import { argentinaCalendarDay } from "../../shared/index.js";
import { type DiscountStatus, discountStatus } from "../model/discount-status.js";
import { normalizeDiscountWeekdays } from "../model/discount-weekdays.js";
import type { DiscountReader, StoredDiscount } from "./discount-reader.js";
import type { Clock } from "./pricing-store.js";

export interface ListDiscountsPorts {
  discounts: DiscountReader;
  clock: Clock;
}

export interface ListedDiscount extends StoredDiscount {
  status: DiscountStatus;
}

export function listedDiscount(stored: StoredDiscount, clock: Clock): ListedDiscount {
  return {
    ...stored,
    weekdays: normalizeDiscountWeekdays(stored.weekdays),
    status: discountStatus(stored, argentinaCalendarDay(clock.now())),
  };
}

export async function listDiscounts({
  discounts,
  clock,
}: ListDiscountsPorts): Promise<ListedDiscount[]> {
  const stored = await discounts.discounts();
  return stored.map((discount) => listedDiscount(discount, clock));
}
