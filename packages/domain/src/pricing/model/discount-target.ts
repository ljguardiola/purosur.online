export const DISCOUNT_TARGET_KINDS = ["PRODUCT", "CATEGORY", "TAG"] as const;

export type DiscountTargetKind = (typeof DISCOUNT_TARGET_KINDS)[number];

export interface DiscountTarget {
  kind: DiscountTargetKind;
  id: string;
}
