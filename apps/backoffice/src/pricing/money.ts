import type { SaleUnit } from "@purosur/domain";
import { formatCents } from "@purosur/ui";

const UNIT_SUFFIX = { UNIT: "", KG: "/ kg" } satisfies Record<SaleUnit, string>;

export function formatCentsWithUnit(cents: number, saleUnit: SaleUnit): string {
  const suffix = UNIT_SUFFIX[saleUnit];
  return suffix ? `${formatCents(cents)} ${suffix}` : formatCents(cents);
}
