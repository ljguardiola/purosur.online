import type { SaleUnit } from "@purosur/domain";
import { formatSignedCents } from "@purosur/ui";
import { perSaleUnit } from "../platform/per-sale-unit";

export function formatStockUnitCost(unitCostCents: number | null, saleUnit: SaleUnit): string {
  return unitCostCents === null
    ? "Sin costo"
    : perSaleUnit(formatSignedCents(unitCostCents), saleUnit);
}

export function formatStockValue(valueCents: number | null): string {
  return valueCents === null ? "—" : formatSignedCents(valueCents);
}
