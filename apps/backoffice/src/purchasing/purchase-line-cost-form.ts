import type { PurchaseLineCostCorrectionBody, PurchaseSummary } from "@purosur/contracts";
import { formatAmountInput, parseAmountCents } from "@purosur/ui";

type CostLine = Pick<PurchaseSummary["lines"][number], "costPaidCents" | "packages" | "product">;

export type PurchaseLineCostValues = { cost: string };

export const EMPTY_PURCHASE_LINE_COST: PurchaseLineCostValues = { cost: "" };

export function purchaseLineCostValuesOf(line: Pick<CostLine, "costPaidCents">) {
  return { cost: formatAmountInput(line.costPaidCents) };
}

export function purchaseLineCostRequestFrom({
  cost,
}: PurchaseLineCostValues): PurchaseLineCostCorrectionBody {
  return { costPaidCents: parseAmountCents(cost) ?? Number.NaN };
}

export function purchaseLineCostLabel(line: Pick<CostLine, "packages" | "product">): string {
  if (line.packages !== null) {
    return "Costo pagado por paquete";
  }
  return line.product.saleUnit === "KG" ? "Costo pagado por kg" : "Costo pagado por unidad";
}

export const PURCHASE_LINE_COST_FIELDS = { costPaidCents: "cost" } as const;

export function purchaseLineCostMessage(): string {
  return "Escribí el costo pagado con hasta 2 decimales, por ejemplo 1.250,50.";
}
