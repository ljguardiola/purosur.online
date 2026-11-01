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

function stepsToCover({ numerator, denominator }: Fraction, step: number): number {
  const stepSize = denominator * BigInt(step);
  return Number((numerator + stepSize - 1n) / stepSize);
}

export function packagesToCover(shortfall: Fraction, packageQuantity: number): number {
  return stepsToCover(shortfall, packageQuantity);
}

export function quantityToOrderWithoutSupplier(shortfall: Fraction, saleUnit: SaleUnit): number {
  const step = saleUnit === "UNIT" ? STOCK_QUANTITY_PER_UNIT : 1;
  return stepsToCover(shortfall, step) * step;
}
