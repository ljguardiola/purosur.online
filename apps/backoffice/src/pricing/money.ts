import { MAX_UNIT_PRICE_CENTS } from "@purosur/domain";
import { formatNumber } from "@purosur/ui";
import type { ProductSaleUnit } from "../catalog/products-api";
import { parseEsArNumber } from "../platform/es-ar-number";

export { MAX_UNIT_PRICE_CENTS };

export function formatCents(cents: number): string {
  return `$ ${formatNumber(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const UNIT_SUFFIX = { UNIT: "", KG: "/ kg" } satisfies Record<ProductSaleUnit, string>;

export function formatCentsWithUnit(cents: number, saleUnit: ProductSaleUnit): string {
  const suffix = UNIT_SUFFIX[saleUnit];
  return suffix ? `${formatCents(cents)} ${suffix}` : formatCents(cents);
}

export function parseAmountCents(value: string): number | undefined {
  const digits = parseEsArNumber(value, 2);
  if (!digits) {
    return undefined;
  }
  return Number(digits.whole) * 100 + Number(digits.fraction.padEnd(2, "0"));
}
