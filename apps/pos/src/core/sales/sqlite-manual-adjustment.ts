import type { ManualAdjustment } from "@purosur/domain";

export interface ManualAdjustmentColumns {
  manual_adjustment_kind: ManualAdjustment["kind"] | null;
  manual_adjustment_value: number | null;
  manual_adjustment_reason: string | null;
  manual_adjustment_authorized_by: string | null;
}

export function manualAdjustmentColumns(
  adjustment: ManualAdjustment | null,
): ManualAdjustmentColumns {
  if (adjustment === null) {
    return {
      manual_adjustment_kind: null,
      manual_adjustment_value: null,
      manual_adjustment_reason: null,
      manual_adjustment_authorized_by: null,
    };
  }
  return {
    manual_adjustment_kind: adjustment.kind,
    manual_adjustment_value: valueOfAdjustment(adjustment),
    manual_adjustment_reason: adjustment.reason,
    manual_adjustment_authorized_by: adjustment.authorizedBy,
  };
}

function valueOfAdjustment(adjustment: ManualAdjustment): number {
  switch (adjustment.kind) {
    case "PRICE":
      return adjustment.unitPrice;
    case "PERCENT":
      return adjustment.percent;
    case "AMOUNT":
      return adjustment.amount;
  }
}

export function toManualAdjustment(columns: ManualAdjustmentColumns): ManualAdjustment | null {
  const {
    manual_adjustment_kind: kind,
    manual_adjustment_value: value,
    manual_adjustment_reason: reason,
    manual_adjustment_authorized_by: authorizedBy,
  } = columns;
  if (kind === null || value === null || reason === null) {
    return null;
  }
  switch (kind) {
    case "PRICE":
      return { kind, unitPrice: value, reason, authorizedBy };
    case "PERCENT":
      return { kind, percent: value, reason, authorizedBy };
    case "AMOUNT":
      return { kind, amount: value, reason, authorizedBy };
  }
}
