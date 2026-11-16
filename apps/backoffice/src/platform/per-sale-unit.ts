import type { SaleUnit } from "@purosur/domain";

const UNIT_SUFFIX = { UNIT: undefined, KG: "/ kg" } satisfies Record<SaleUnit, string | undefined>;

export function saleUnitSuffix(saleUnit: SaleUnit): string | undefined {
  return UNIT_SUFFIX[saleUnit];
}

export function perSaleUnit(amount: string, saleUnit: SaleUnit): string {
  const suffix = saleUnitSuffix(saleUnit);
  return suffix === undefined ? amount : `${amount} ${suffix}`;
}
