import type { StockMovement } from "@purosur/contracts";
import type { AdjustmentReason, LossReason, ReportedLossReason } from "@purosur/domain";

export const LOSS_REASON_LABELS = {
  broken_or_spilled: "Rotura o derrame",
  spoiled: "Mal estado",
  portioning_waste: "Merma de fraccionamiento",
  tasting_or_sample: "Degustación o muestra",
  store_consumption: "Consumo del local",
  theft: "Robo",
} satisfies Record<LossReason, string>;

export const ADJUSTMENT_REASON_LABELS = {
  purchase_correction: "Error en una compra",
  supplier_return: "Devolución al proveedor",
  batch_correction: "Corrección de una producción",
} satisfies Record<AdjustmentReason, string>;

export const REASON_LABELS: Record<StockMovement["reason"], string> = {
  ...LOSS_REASON_LABELS,
  expired: "Vencimiento",
  return_discard: "Descarte de devolución",
  ...ADJUSTMENT_REASON_LABELS,
};

export const REPORTED_LOSS_REASON_LABELS = {
  ...LOSS_REASON_LABELS,
  expired: REASON_LABELS.expired,
  return_discard: REASON_LABELS.return_discard,
  defective_exchange: "Cambio por defectuoso",
} satisfies Record<ReportedLossReason, string>;
