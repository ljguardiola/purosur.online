import type { Clock } from "../../shared/index.js";
import type { ManualAdjustmentValue } from "../model/manual-adjustment.js";
import {
  type ManualAdjustmentRefusal,
  manualAdjustmentRefusal,
  withManualAdjustment,
} from "../model/sale-line.js";
import type { SaleLedger } from "./sale-ledger.js";
import {
  isSaleLineChangeRefusal,
  type SaleLineChangeRefusal,
  saleToChange,
} from "./sale-line-change.js";

export interface PreviewSaleLineAdjustmentInput {
  actorId: string;
  lineId: string;
  adjustment: ManualAdjustmentValue;
}

export interface PreviewSaleLineAdjustmentPorts {
  ledger: SaleLedger;
  clock: Clock;
}

export type PreviewSaleLineAdjustmentOutcome =
  | SaleLineChangeRefusal
  | { kind: "unknown_line" }
  | ManualAdjustmentRefusal
  | { kind: "preview"; discountAmount: number; lineTotal: number };

export function previewSaleLineAdjustment(
  { ledger, clock }: PreviewSaleLineAdjustmentPorts,
  { actorId, lineId, adjustment }: PreviewSaleLineAdjustmentInput,
): PreviewSaleLineAdjustmentOutcome {
  return ledger.transaction<PreviewSaleLineAdjustmentOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock);
    if (isSaleLineChangeRefusal(sale)) {
      return sale;
    }
    const line = sale.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      return { kind: "unknown_line" };
    }
    const refusal = manualAdjustmentRefusal(line, adjustment);
    if (refusal) {
      return refusal;
    }
    const { discountAmount, lineTotal } = withManualAdjustment(line, {
      ...adjustment,
      reason: "",
      authorizedBy: null,
    });
    return { kind: "preview", discountAmount, lineTotal };
  });
}
