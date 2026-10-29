import { type Fraction, isValidCashAmount } from "../../shared/index.js";
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

export interface PurchaseLineCost {
  costPaidCents: number;
  quantity: number;
  quantityPerPackage: number;
}

export function lineValue({
  costPaidCents,
  quantity,
  quantityPerPackage,
}: PurchaseLineCost): Fraction {
  return {
    numerator: BigInt(costPaidCents) * BigInt(quantity),
    denominator: BigInt(quantityPerPackage),
  };
}
