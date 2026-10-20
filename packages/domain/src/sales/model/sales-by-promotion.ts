import type { DiscountBenefit, DiscountTargetKind } from "../../pricing/index.js";
import { codeUnitOrder, nameOrder } from "./report-order.js";
import { saleUnitOfWeightSource, soldQuantity } from "./sale-line.js";
import type { WeightSource } from "./weight-source.js";

export interface PromotionTerms {
  benefit: DiscountBenefit;
  target: { kind: DiscountTargetKind; name: string };
  weekdays: readonly number[];
}

export interface DiscountedLinesOfPromotion {
  promotionId: string;
  name: string | null;
  terms: PromotionTerms | null;
  weightSource: WeightSource | null;
  quantity: number;
  lines: number;
  discounted: number;
}

export interface SalesOfPromotion {
  promotionId: string;
  name: string | null;
  terms: PromotionTerms | null;
  lines: number;
  units: number;
  thousandths: number;
  discounted: number;
}

export interface PromotionDiscountTotals {
  discounted: number;
  lines: number;
  mostUsed: { promotionId: string; name: string | null; lines: number } | null;
}

function byName(a: SalesOfPromotion, b: SalesOfPromotion): number {
  return nameOrder(a.name, b.name) || codeUnitOrder(a.promotionId, b.promotionId);
}

function promotionOrder(a: SalesOfPromotion, b: SalesOfPromotion): number {
  return b.discounted - a.discounted || byName(a, b);
}

function mostUsedOrder(a: SalesOfPromotion, b: SalesOfPromotion): number {
  return b.lines - a.lines || promotionOrder(a, b);
}

export function salesOfPromotions(rows: readonly DiscountedLinesOfPromotion[]): SalesOfPromotion[] {
  const promotions = new Map<string, SalesOfPromotion>();
  for (const row of rows) {
    const promotion = promotions.get(row.promotionId) ?? {
      promotionId: row.promotionId,
      name: row.name,
      terms: row.terms,
      lines: 0,
      units: 0,
      thousandths: 0,
      discounted: 0,
    };
    const sold = soldQuantity({
      quantity: row.quantity,
      saleUnit: saleUnitOfWeightSource(row.weightSource),
    });
    promotions.set(row.promotionId, {
      ...promotion,
      lines: promotion.lines + row.lines,
      units: promotion.units + (sold.saleUnit === "UNIT" ? sold.units : 0),
      thousandths: promotion.thousandths + (sold.saleUnit === "KG" ? sold.thousandths : 0),
      discounted: promotion.discounted + row.discounted,
    });
  }
  return [...promotions.values()].sort(promotionOrder);
}

export function promotionDiscountTotals(
  rows: readonly SalesOfPromotion[],
): PromotionDiscountTotals {
  const [mostUsed] = [...rows].sort(mostUsedOrder);
  return {
    discounted: rows.reduce((sum, row) => sum + row.discounted, 0),
    lines: rows.reduce((sum, row) => sum + row.lines, 0),
    mostUsed:
      mostUsed === undefined
        ? null
        : { promotionId: mostUsed.promotionId, name: mostUsed.name, lines: mostUsed.lines },
  };
}
