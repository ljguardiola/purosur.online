import type { OpenSale } from "@purosur/contracts";
import { formatCents, formatNumber } from "@purosur/ui";

type LineAdjustment = NonNullable<OpenSale["lines"][number]["manual_adjustment"]>;

export function lineAdjustmentText(adjustment: Pick<LineAdjustment, "kind" | "value">): string {
  switch (adjustment.kind) {
    case "PRICE":
      return `Precio modificado: ${formatCents(adjustment.value)}`;
    case "PERCENT":
      return `Descuento manual ${formatNumber(adjustment.value)} %`;
    case "AMOUNT":
      return `Descuento manual ${formatCents(adjustment.value)}`;
  }
}
