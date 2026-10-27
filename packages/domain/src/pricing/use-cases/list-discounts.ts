import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { argentinaCalendarDay } from "../../shared/index.js";
import { type DiscountStatus, discountStatus } from "../model/discount-status.js";
import { normalizeDiscountWeekdays } from "../model/discount-weekdays.js";
import type { DiscountReader, StoredDiscount } from "./discount-reader.js";

export interface ListDiscountsPorts {
  discounts: DiscountReader;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

export interface ListedDiscount extends StoredDiscount {
  status: DiscountStatus;
}

export function listedDiscount(
  stored: StoredDiscount,
  clock: Clock,
  zoneRules: ZoneRulesSource,
): ListedDiscount {
  return {
    ...stored,
    weekdays: normalizeDiscountWeekdays(stored.weekdays),
    status: discountStatus(stored, argentinaCalendarDay(clock.now(), zoneRules.zoneRules())),
  };
}

export async function listDiscounts({
  discounts,
  clock,
  zoneRules,
}: ListDiscountsPorts): Promise<ListedDiscount[]> {
  const stored = await discounts.discounts();
  return stored.map((discount) => listedDiscount(discount, clock, zoneRules));
}
