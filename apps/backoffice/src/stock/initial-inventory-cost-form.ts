import { type LotReferenceCostBody, lotReferenceCostBodySchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { formatCents, parseAmountCents } from "@purosur/ui";
import { schemaLimit } from "../platform/schema-limit";

const COST_REQUIRED = "Ingresá el costo de referencia.";
const COST_MALFORMED = "Escribí el costo con coma para los decimales, por ejemplo 10.180,50.";
const UNIT_COST_SCHEMA = lotReferenceCostBodySchema.shape.unitCostCents;
const COST_OUT_OF_RANGE = `Ingresá un costo mayor a cero, de hasta ${formatCents(schemaLimit(UNIT_COST_SCHEMA.meta()?.["maxValue"]))}.`;
const COST_REVIEW = "Revisá el costo.";

export type CostFormValues = { cost: string };

export const EMPTY_COST_FORM: CostFormValues = { cost: "" };

export function costRequestFrom({ cost }: CostFormValues): LotReferenceCostBody {
  return { unitCostCents: parseAmountCents(cost) ?? Number.NaN };
}

export function costMessage({ cost }: CostFormValues): string {
  if (cost.trim() === "") {
    return COST_REQUIRED;
  }
  const cents = parseAmountCents(cost);
  if (cents === undefined) {
    return COST_MALFORMED;
  }
  return UNIT_COST_SCHEMA.safeParse(cents).success ? COST_REVIEW : COST_OUT_OF_RANGE;
}

export function referenceCostLabel(saleUnit: SaleUnit): string {
  return saleUnit === "KG" ? "Costo de referencia por kg" : "Costo de referencia por unidad";
}
