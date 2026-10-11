import type { SaleUnit } from "@purosur/domain";

const UNIT_SUFFIX = { UNIT: "", KG: "/ kg" } satisfies Record<SaleUnit, string>;

export function perSaleUnit(amount: string, saleUnit: SaleUnit): string {
  const suffix = UNIT_SUFFIX[saleUnit];
  return suffix ? `${amount} ${suffix}` : amount;
}
