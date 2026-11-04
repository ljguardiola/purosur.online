import type { SaleUnit } from "../../catalog/index.js";
import type { Fraction, ReportPeriod } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";
import { daysEndingOn } from "./days-ending-on.js";

export const ORDER_SUGGESTION_SALES_DAYS = 30;

export function orderSuggestionPeriod(today: string): ReportPeriod {
  return daysEndingOn(today, ORDER_SUGGESTION_SALES_DAYS);
}

export function soldThousandths(
  sold: { units: number; thousandths: number },
  saleUnit: SaleUnit,
): number {
  return saleUnit === "UNIT" ? sold.units * STOCK_QUANTITY_PER_UNIT : sold.thousandths;
}

// In thousandths of the sale unit: what the average daily sales of the sales period need over the
// coverage days beyond the stock and what awaited orders still have to bring, or null when those
// already cover them.
export function shortfallToCover({
  soldThousandths: sold,
  coverageDays,
  stockThousandths,
  awaitedThousandths,
}: {
  soldThousandths: number;
  coverageDays: number;
  stockThousandths: number;
  awaitedThousandths: number;
}): Fraction | null {
  const numerator =
    BigInt(sold) * BigInt(coverageDays) -
    BigInt(stockThousandths + awaitedThousandths) * BigInt(ORDER_SUGGESTION_SALES_DAYS);
  return numerator > 0n ? { numerator, denominator: BigInt(ORDER_SUGGESTION_SALES_DAYS) } : null;
}

export function effectiveCoverageDays(
  coverageDays: number,
  shelfLifeDays: number | null,
): { days: number; cappedByExpiry: boolean } {
  return shelfLifeDays !== null && shelfLifeDays < coverageDays
    ? { days: shelfLifeDays, cappedByExpiry: true }
    : { days: coverageDays, cappedByExpiry: false };
}

// In thousandths of the sale unit: the most that sells over the shelf life beyond the stock and
// what awaited orders still have to bring, or null when no lot gives a shelf life.
export function expiryCapQuantity({
  soldThousandths: sold,
  shelfLifeDays,
  stockThousandths,
  awaitedThousandths,
}: {
  soldThousandths: number;
  shelfLifeDays: number | null;
  stockThousandths: number;
  awaitedThousandths: number;
}): Fraction | null {
  return shelfLifeDays === null
    ? null
    : {
        numerator:
          BigInt(sold) * BigInt(shelfLifeDays) -
          BigInt(stockThousandths + awaitedThousandths) * BigInt(ORDER_SUGGESTION_SALES_DAYS),
        denominator: BigInt(ORDER_SUGGESTION_SALES_DAYS),
      };
}

function stepsToOrder(shortfall: Fraction, step: number, cap: Fraction | null): number {
  const stepSize = shortfall.denominator * BigInt(step);
  const roundedUp = (shortfall.numerator + stepSize - 1n) / stepSize;
  if (cap === null) {
    return Number(roundedUp);
  }
  const roundedDown = cap.numerator / (cap.denominator * BigInt(step));
  return Math.min(Number(roundedUp), Number(roundedDown));
}

export function packagesToCover(
  shortfall: Fraction,
  packageQuantity: number,
  cap: Fraction | null = null,
): number {
  return stepsToOrder(shortfall, packageQuantity, cap);
}

export function quantityToOrderWithoutSupplier(
  shortfall: Fraction,
  saleUnit: SaleUnit,
  cap: Fraction | null = null,
): number {
  const step = saleUnit === "UNIT" ? STOCK_QUANTITY_PER_UNIT : 1;
  return stepsToOrder(shortfall, step, cap) * step;
}
