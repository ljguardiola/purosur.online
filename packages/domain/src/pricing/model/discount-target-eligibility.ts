import type { SaleUnit } from "../../catalog/index.js";
import type { DiscountBenefit } from "./discount-benefit.js";
import { isBuyNPayMSaleUnit } from "./discount-buy-n-pay-m.js";
import type { DiscountTargetKind } from "./discount-target.js";

export type AssignableTargetCandidate =
  | { kind: "PRODUCT"; active: boolean; saleUnit: SaleUnit }
  | { kind: "TAG"; active: boolean }
  | { kind: "CATEGORY" };

export function isTargetKindAllowedFor(
  benefitKind: DiscountBenefit["kind"],
  targetKind: DiscountTargetKind,
): boolean {
  return benefitKind === "PERCENT_OFF" || targetKind === "PRODUCT";
}

export function isAssignableTarget(candidate: AssignableTargetCandidate): boolean {
  return candidate.kind === "CATEGORY" || candidate.active;
}

export function targetAcceptsBenefit(
  candidate: AssignableTargetCandidate,
  benefitKind: DiscountBenefit["kind"],
): boolean {
  if (candidate.kind !== "PRODUCT") {
    return isTargetKindAllowedFor(benefitKind, candidate.kind);
  }
  return benefitKind !== "BUY_N_PAY_M" || isBuyNPayMSaleUnit(candidate.saleUnit);
}
