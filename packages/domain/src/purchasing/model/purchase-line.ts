import { isValidCashAmount, roundHalfUp } from "../../shared/index.js";
import { MAX_STOCK_QUANTITY, STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";

// A line loaded by quantity is paid per sale unit, so its quantity per package is one unit or one kilo.
export const ONE_SALE_UNIT_QUANTITY = STOCK_QUANTITY_PER_UNIT;

export function isPackageCount(packages: number): boolean {
  return Number.isInteger(packages) && packages > 0 && packages <= MAX_STOCK_QUANTITY;
}

export function isCostPaid(cents: number): boolean {
  return isValidCashAmount(cents);
}

export function packagedQuantity(packages: number, quantityPerPackage: number): number {
  return packages * quantityPerPackage;
}

// The only rounding of a cost: the exact pair stays as it was paid and is rounded only to be shown.
export function unitCostCents(costPaidCents: number, quantityPerPackage: number): number {
  return roundHalfUp({
    numerator: BigInt(costPaidCents) * BigInt(ONE_SALE_UNIT_QUANTITY),
    denominator: BigInt(quantityPerPackage),
  });
}
