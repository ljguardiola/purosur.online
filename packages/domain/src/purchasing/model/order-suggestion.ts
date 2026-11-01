import type { SaleUnit } from "../../catalog/index.js";
import { type Fraction, type ReportPeriod, shiftCalendarDay } from "../../shared/index.js";
import { STOCK_QUANTITY_PER_UNIT } from "../../stock/index.js";

export const ORDER_SUGGESTION_SALES_DAYS = 30;

export function orderSuggestionPeriod(today: string): ReportPeriod {
  return { from: shiftCalendarDay(today, 1 - ORDER_SUGGESTION_SALES_DAYS), to: today };
}

export function soldThousandths(
  sold: { units: number; thousandths: number },
  saleUnit: SaleUnit,
): number {
  return saleUnit === "UNIT" ? sold.units * STOCK_QUANTITY_PER_UNIT : sold.thousandths;
}

// In thousandths of the sale unit: what the average daily sales of the sales period need over the
// coverage days beyond the stock, or null when the stock already covers them.
export function shortfallToCover({
  soldThousandths: sold,
  coverageDays,
  stockThousandths,
}: {
  soldThousandths: number;
  coverageDays: number;
  stockThousandths: number;
}): Fraction | null {
  const numerator =
    BigInt(sold) * BigInt(coverageDays) -
    BigInt(stockThousandths) * BigInt(ORDER_SUGGESTION_SALES_DAYS);
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

// In thousandths of the sale unit: the most that sells over the shelf life beyond the stock, or
// null when no lot gives a shelf life.
export function expiryCapQuantity({
  soldThousandths: sold,
  shelfLifeDays,
  stockThousandths,
}: {
  soldThousandths: number;
  shelfLifeDays: number | null;
  stockThousandths: number;
}): Fraction | null {
  return shelfLifeDays === null
    ? null
    : {
        numerator:
          BigInt(sold) * BigInt(shelfLifeDays) -
          BigInt(stockThousandths) * BigInt(ORDER_SUGGESTION_SALES_DAYS),
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
  return Number(roundedUp < roundedDown ? roundedUp : roundedDown);
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
