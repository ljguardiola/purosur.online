import type { Clock, OperationAuthority } from "../../shared/index.js";
import type { ManualAdjustmentValue } from "../model/manual-adjustment.js";
import {
  type ManualAdjustmentRefusal,
  manualAdjustmentRefusal,
  withManualAdjustment,
} from "../model/sale-line.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { SaleLedger } from "./sale-ledger.js";
import {
  type ChangedLineOutcome,
  changedLine,
  isSaleLineChangeRefusal,
  type SaleLineChangeRefusal,
  saleToChange,
} from "./sale-line-change.js";

export interface AdjustSaleLineInput {
  lineId: string;
  adjustment: ManualAdjustmentValue;
  reason: string;
}

export interface AdjustSaleLineGrant {
  actorId: string;
  authorizedBy: string | undefined;
}

export interface AdjustSaleLinePorts<Grant extends AdjustSaleLineGrant, Refusal> {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  authority: OperationAuthority<Grant, Refusal>;
}

export type AdjustSaleLineOutcome =
  | SaleLineChangeRefusal
  | { kind: "unknown_line" }
  | ManualAdjustmentRefusal
  | ChangedLineOutcome;

export async function adjustSaleLine<Grant extends AdjustSaleLineGrant, Refusal>(
  { ledger, restoration, clock, authority }: AdjustSaleLinePorts<Grant, Refusal>,
  { lineId, adjustment, reason }: AdjustSaleLineInput,
): Promise<AdjustSaleLineOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const { actorId, authorizedBy } = authorization.grant;

  return ledger.transaction<AdjustSaleLineOutcome>((tx) => {
    const sale = saleToChange(tx, actorId, clock, restoration);
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

    const updated = withManualAdjustment(line, {
      ...adjustment,
      reason,
      authorizedBy: authorizedBy ?? null,
    });
    tx.recordChangedLine(updated);
    return changedLine(tx, sale, line, updated, clock.now());
  });
}
