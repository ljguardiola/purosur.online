import type { LotReferenceCostBody } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { parseAmountCents } from "@purosur/ui";

const COST_REQUIRED = "Ingresá el costo de referencia.";
const COST_MALFORMED = "Escribí el costo con coma para los decimales, por ejemplo 10.180,50.";
const COST_OUT_OF_RANGE = "Ingresá un costo mayor a cero.";

export type CostFormValues = { cost: string };

export const EMPTY_COST_FORM: CostFormValues = { cost: "" };

export function costRequestFrom({ cost }: CostFormValues): LotReferenceCostBody {
  return { unitCostCents: parseAmountCents(cost) ?? Number.NaN };
}

export function costMessage({ cost }: CostFormValues): string {
  if (cost.trim() === "") {
    return COST_REQUIRED;
  }
  return parseAmountCents(cost) === undefined ? COST_MALFORMED : COST_OUT_OF_RANGE;
}

export function referenceCostLabel(saleUnit: SaleUnit): string {
  return saleUnit === "KG" ? "Costo de referencia por kg" : "Costo de referencia por unidad";
}
