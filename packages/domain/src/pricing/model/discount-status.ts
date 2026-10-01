export const DISCOUNT_STATUSES = ["current", "scheduled", "ended", "deactivated"] as const;

export type DiscountStatus = (typeof DISCOUNT_STATUSES)[number];

export interface DiscountSchedule {
  active: boolean;
  validFrom: string;
  validTo: string;
}

export function discountStatus(discount: DiscountSchedule, today: string): DiscountStatus {
  if (!discount.active) {
    return "deactivated";
  }
  if (today < discount.validFrom) {
    return "scheduled";
  }
  return today > discount.validTo ? "ended" : "current";
}

export function isDiscountLive(discount: DiscountSchedule, today: string): boolean {
  const status = discountStatus(discount, today);
  return status === "current" || status === "scheduled";
}
