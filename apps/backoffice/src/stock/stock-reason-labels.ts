import type { AdjustmentReason, LossReason } from "@purosur/domain";

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
  batch_correction: "Corrección de una tanda",
} satisfies Record<AdjustmentReason, string>;

export const REASON_LABELS: Record<LossReason | AdjustmentReason, string> = {
  ...LOSS_REASON_LABELS,
  ...ADJUSTMENT_REASON_LABELS,
};
