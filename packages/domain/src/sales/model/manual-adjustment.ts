import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";

export type ManualAdjustmentValue =
  | { kind: "PRICE"; unitPrice: number }
  | { kind: "PERCENT"; percent: number }
  | { kind: "AMOUNT"; amount: number };

export type ManualAdjustment = ManualAdjustmentValue & {
  reason: string;
  authorizedBy: string | null;
};

export function mayBeManualDiscountPercent(percent: number): boolean {
  return Number.isInteger(percent) && percent >= 1 && percent <= 100;
}

export function mayBeManualDiscountAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

export function mayBeOverriddenUnitPrice(unitPrice: number): boolean {
  return Number.isInteger(unitPrice) && unitPrice >= 0 && unitPrice <= MAX_UNIT_PRICE_CENTS;
}

export function manualAdjustmentReason(typed: string): string | undefined {
  const reason = typed.trim();
  return reason === "" ? undefined : reason;
}
