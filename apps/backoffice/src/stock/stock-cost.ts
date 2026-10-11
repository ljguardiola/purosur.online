import type { SaleUnit } from "@purosur/domain";
import { formatSignedCents } from "@purosur/ui";

export function formatStockUnitCost(unitCostCents: number | null, saleUnit: SaleUnit): string {
  if (unitCostCents === null) {
    return "Sin costo";
  }
  const cost = formatSignedCents(unitCostCents);
  return saleUnit === "KG" ? `${cost} / kg` : cost;
}

export function formatStockValue(valueCents: number | null): string {
  return valueCents === null ? "—" : formatSignedCents(valueCents);
}
