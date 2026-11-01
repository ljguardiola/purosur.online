import type { ManualDiscountsBody } from "@purosur/contracts";
import { formatCents, formatNumber } from "@purosur/ui";

type DiscountRow = ManualDiscountsBody["rows"][number];

export function manualDiscountKindName({ kind, adjustment }: DiscountRow): string {
  if (adjustment.kind === "PRICE") {
    return "Precio nuevo";
  }
  return kind === "SALE" ? "Sobre el total" : "De línea";
}

export function manualDiscountKindText(row: DiscountRow): string {
  const { adjustment } = row;
  if (adjustment.kind === "PRICE") {
    return manualDiscountKindName(row);
  }
  const off =
    adjustment.kind === "PERCENT"
      ? `${formatNumber(adjustment.value)} %`
      : formatCents(adjustment.value);
  return `${manualDiscountKindName(row)} · ${off}`;
}
