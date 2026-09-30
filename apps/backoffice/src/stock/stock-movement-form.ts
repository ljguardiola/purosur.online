import type { StockProduct } from "@purosur/contracts";
import {
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
  adjustmentDirections,
  LOSS_REASONS,
  type LossReason,
  type SaleUnit,
  type StockDirection,
} from "@purosur/domain";
import { sortedItems, textOrder } from "@purosur/ui";
import { ADJUSTMENT_REASON_LABELS, LOSS_REASON_LABELS } from "./stock-reason-labels";

const productNameOrder = textOrder((product: StockProduct) => product.name);

type ProductOption = { value: string; label: string };

export function productOptions(
  products: readonly StockProduct[],
): [ProductOption, ...ProductOption[]] | undefined {
  const [first, ...rest] = sortedItems(products, {
    order: productNameOrder,
    direction: "ascending",
  }).map((product) => ({ value: product.id, label: product.name }));
  return first && [first, ...rest];
}

export function quantityFieldKind(saleUnit: SaleUnit) {
  return { kind: "plain-text" as const, suffix: saleUnit === "KG" ? "kg" : "u" };
}

export function quantityMessage(saleUnit: SaleUnit): string {
  return saleUnit === "KG"
    ? "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150."
    : "Escribí una cantidad entera de unidades, por ejemplo 16.";
}

export type LossValues = { productId: string | null; quantity: string; reason: LossReason | null };

export type AdjustmentValues = {
  productId: string | null;
  quantity: string;
  reason: AdjustmentReason | null;
  direction: StockDirection;
};

export const LOSS_REASON_OPTIONS = LOSS_REASONS.map((reason) => ({
  value: reason,
  label: LOSS_REASON_LABELS[reason],
})) as [{ value: LossReason; label: string }, ...{ value: LossReason; label: string }[]];

export const ADJUSTMENT_REASON_OPTIONS = ADJUSTMENT_REASONS.map((reason) => ({
  value: reason,
  label: ADJUSTMENT_REASON_LABELS[reason],
})) as [
  { value: AdjustmentReason; label: string },
  ...{ value: AdjustmentReason; label: string }[],
];

export const PRODUCT_REQUIRED = "Elegí el producto.";
export const REASON_REQUIRED = "Elegí el motivo.";

export function soleDirection(reason: AdjustmentReason | null): StockDirection | undefined {
  const [only, ...others] = reason === null ? [] : adjustmentDirections(reason);
  return others.length === 0 ? only : undefined;
}
