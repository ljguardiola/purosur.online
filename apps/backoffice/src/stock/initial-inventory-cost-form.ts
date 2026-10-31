import { type LotReferenceCostBody, lotReferenceCostBodySchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  formatCalendarDayNumeric,
  formatCents,
  formatSaleUnitQuantity,
  parseAmountCents,
} from "@purosur/ui";
import { schemaLimit } from "../platform/schema-limit";
import type { InitialInventoryLot } from "./edit-lot-cost-modal";
import { formatStockUnitCost } from "./stock-cost";

const COST_REQUIRED = "Ingresá el costo de referencia.";
const COST_MALFORMED = "Escribí el costo con coma para los decimales, por ejemplo 10.180,50.";
const UNIT_COST_SCHEMA = lotReferenceCostBodySchema.options[0].shape.unitCostCents;
const COST_OUT_OF_RANGE = `Ingresá un costo mayor a cero, de hasta ${formatCents(schemaLimit(UNIT_COST_SCHEMA.meta()?.["maxValue"]))}.`;
const COST_REVIEW = "Revisá el costo.";

export type CostFormValues = { cost: string; supplierItemId: string | null };

export const EMPTY_COST_FORM: CostFormValues = { cost: "", supplierItemId: null };

export const supplierPriceMessage = "Elegí el precio de un proveedor.";

export function costFormValuesOf({ supplierPrices }: InitialInventoryLot): CostFormValues {
  const chosen = supplierPrices.find((price) => price.current) ?? supplierPrices[0];
  return { ...EMPTY_COST_FORM, supplierItemId: chosen?.supplierItemId ?? null };
}

export function costRequestFrom({ cost, supplierItemId }: CostFormValues): LotReferenceCostBody {
  return supplierItemId === null
    ? { unitCostCents: parseAmountCents(cost) ?? Number.NaN }
    : { supplierItemId };
}

export function supplierPriceOptions({ saleUnit, supplierPrices }: InitialInventoryLot) {
  return supplierPrices.map((price) => ({
    value: price.supplierItemId,
    label: `${price.supplierName} del ${formatCalendarDayNumeric(price.listDate)} · ${formatSaleUnitQuantity(price.quantity, price.saleUnit)} · ${formatStockUnitCost(price.unitCostCents, saleUnit)}`,
    ...(price.cheapest ? { status: "La más barata" } : {}),
  }));
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
