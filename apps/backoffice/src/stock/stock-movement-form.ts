import {
  type StockMovement,
  type StockProduct,
  stockAdjustmentBodySchema,
  stockAdjustmentDirectionsSchema,
  stockLossBodySchema,
  stockMovementListSchema,
} from "@purosur/contracts";
import type { AdjustmentReason, LossReason, SaleUnit, StockDirection } from "@purosur/domain";
import { sortedItems, textOrder } from "@purosur/ui";
import { ADJUSTMENT_REASON_LABELS, LOSS_REASON_LABELS } from "./stock-reason-labels";

export type MovementKind = StockMovement["kind"];

export const MOVEMENT_KINDS = stockMovementListSchema.shape.movements.element.shape.kind.options;

export const REASONS_OF_KIND = {
  loss: stockLossBodySchema.shape.reason.options,
  adjustment: stockAdjustmentBodySchema.shape.reason.options,
} satisfies Record<MovementKind, readonly StockMovement["reason"][]>;

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

export const LOSS_REASON_OPTIONS = REASONS_OF_KIND.loss.map((reason) => ({
  value: reason,
  label: LOSS_REASON_LABELS[reason],
})) as [{ value: LossReason; label: string }, ...{ value: LossReason; label: string }[]];

export const ADJUSTMENT_REASON_OPTIONS = REASONS_OF_KIND.adjustment.map((reason) => ({
  value: reason,
  label: ADJUSTMENT_REASON_LABELS[reason],
})) as [
  { value: AdjustmentReason; label: string },
  ...{ value: AdjustmentReason; label: string }[],
];

export const PRODUCT_REQUIRED = "Elegí el producto.";
export const REASON_REQUIRED = "Elegí el motivo.";

export function soleDirection(reason: AdjustmentReason | null): StockDirection | undefined {
  const [only, ...others] =
    reason === null ? [] : stockAdjustmentDirectionsSchema.shape[reason].options;
  return others.length === 0 ? only : undefined;
}
