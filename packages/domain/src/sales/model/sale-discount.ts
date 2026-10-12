import { roundHalfUp } from "../../shared/index.js";
import type { ManualAdjustmentValue } from "./manual-adjustment.js";
import type { SaleLine } from "./sale.js";
import { saleTotal } from "./sale-line.js";

export type SaleDiscountValue = Extract<ManualAdjustmentValue, { kind: "PERCENT" | "AMOUNT" }>;

export type SaleDiscount = SaleDiscountValue & {
  reason: string;
  authorizedBy: string | null;
};

export type SaleDiscountRefusal =
  | { kind: "empty_sale" }
  | { kind: "zero_total" }
  | { kind: "discount_exceeds_sale" };

export type SettledSaleLine = SaleLine & { saleDiscountShare: number };

type DiscountedSale = {
  lines: readonly Pick<SaleLine, "lineTotal">[];
  saleDiscount: SaleDiscount | null;
};

export function saleDiscountAmount(subtotal: number, discount: SaleDiscountValue): number {
  return discount.kind === "AMOUNT"
    ? discount.amount
    : roundHalfUp({
        numerator: BigInt(subtotal) * BigInt(discount.percent),
        denominator: 100n,
      });
}

export function saleDiscountRefusal(
  lines: readonly Pick<SaleLine, "lineTotal">[],
  discount: SaleDiscountValue,
): SaleDiscountRefusal | undefined {
  if (lines.length === 0) {
    return { kind: "empty_sale" };
  }
  const subtotal = saleTotal(lines);
  if (subtotal === 0) {
    return { kind: "zero_total" };
  }
  return discount.kind === "AMOUNT" && discount.amount > subtotal
    ? { kind: "discount_exceeds_sale" }
    : undefined;
}

export function spreadSaleDiscount(lineSubtotals: readonly number[], amount: number): number[] {
  const sum = BigInt(lineSubtotals.reduce((total, subtotal) => total + subtotal, 0));
  if (sum === 0n) {
    return lineSubtotals.map(() => 0);
  }
  const exact = lineSubtotals.map((subtotal) => BigInt(amount) * BigInt(subtotal));
  const shares = exact.map((product) => Number(product / sum));
  const leftover = amount - shares.reduce((total, share) => total + share, 0);
  const byLargestRemainder = exact
    .map((product, position) => ({ position, remainder: product % sum }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.position - b.position : a.remainder > b.remainder ? -1 : 1,
    );
  for (const { position } of byLargestRemainder.slice(0, leftover)) {
    shares[position] = (shares[position] ?? 0) + 1;
  }
  return shares;
}

export function appliedSaleDiscountAmount({ lines, saleDiscount }: DiscountedSale): number {
  return saleDiscount === null ? 0 : saleDiscountAmount(saleTotal(lines), saleDiscount);
}

export function amountToCharge(sale: DiscountedSale): number {
  return saleTotal(sale.lines) - appliedSaleDiscountAmount(sale);
}

export function settledLines(sale: {
  lines: readonly SaleLine[];
  saleDiscount: SaleDiscount | null;
}): SettledSaleLine[] {
  const { lines } = sale;
  const shares = spreadSaleDiscount(
    lines.map((line) => line.lineTotal),
    appliedSaleDiscountAmount(sale),
  );
  return lines.map((line, position) => {
    const saleDiscountShare = shares[position] ?? 0;
    return { ...line, lineTotal: line.lineTotal - saleDiscountShare, saleDiscountShare };
  });
}
