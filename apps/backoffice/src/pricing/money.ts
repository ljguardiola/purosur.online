import { formatCents } from "@purosur/ui";
import type { ProductSaleUnit } from "../catalog/products-api";

const UNIT_SUFFIX = { UNIT: "", KG: "/ kg" } satisfies Record<ProductSaleUnit, string>;

export function formatCentsWithUnit(cents: number, saleUnit: ProductSaleUnit): string {
  const suffix = UNIT_SUFFIX[saleUnit];
  return suffix ? `${formatCents(cents)} ${suffix}` : formatCents(cents);
}
