import type { SaleUnit } from "@purosur/domain";
import { formatCents } from "@purosur/ui";
import { perSaleUnit } from "../platform/per-sale-unit";

export function formatCentsWithUnit(cents: number, saleUnit: SaleUnit): string {
  return perSaleUnit(formatCents(cents), saleUnit);
}
