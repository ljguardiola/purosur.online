export type DiscountStatus = "current" | "scheduled" | "ended" | "deactivated";

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
