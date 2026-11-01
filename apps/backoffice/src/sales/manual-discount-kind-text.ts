import type { ManualDiscountsBody } from "@purosur/contracts";
import { formatCents, formatNumber } from "@purosur/ui";

type DiscountRow = ManualDiscountsBody["rows"][number];

export function manualDiscountKindText({ kind, adjustment }: DiscountRow): string {
  if (adjustment.kind === "PRICE") {
    return "Precio nuevo";
  }
  const scope = kind === "SALE" ? "Sobre el total" : "De línea";
  const off =
    adjustment.kind === "PERCENT"
      ? `${formatNumber(adjustment.value)} %`
      : formatCents(adjustment.value);
  return `${scope} · ${off}`;
}
