import { FACTURA_C_VOUCHER_TYPE } from "../model/factura-c-fiscal-block.js";
import { FACTURA_C_DOCUMENT_TYPE } from "../model/fiscal-rejection-standing.js";
import {
  decideNumberingReconciliation,
  NUMBERING_CONFLICT_REASK_INTERVAL_MS,
} from "../model/numbering-conflict.js";
import type { ReconcileNumberingConflictPorts } from "./numbering-conflict-ports.js";

export interface ReconcileNumberingConflictInput {
  pointOfSale: number;
}

export type ReconcileNumberingConflictOutcome =
  | { kind: "reconciled"; lastAuthorized: number; alertedNumbers: number[] }
  | { kind: "waiting"; askAgainAt: Date }
  | { kind: "retry"; askAgainAt: Date }
  | { kind: "not_frozen" };

export async function reconcileNumberingConflict(
  { lanes, clock, tokens, taxAuthority }: ReconcileNumberingConflictPorts,
  { pointOfSale }: ReconcileNumberingConflictInput,
): Promise<ReconcileNumberingConflictOutcome> {
  return lanes.inPointOfSaleLane<ReconcileNumberingConflictOutcome>(pointOfSale, async (lane) => {
    const askAgainAt = () => new Date(clock.now().getTime() + NUMBERING_CONFLICT_REASK_INTERVAL_MS);
    const freeze = await lane.numberingFreeze();
    if (freeze === null) {
      return { kind: "not_frozen" };
    }

    const token = await tokens.validToken();
    if (token === null) {
      return { kind: "retry", askAgainAt: askAgainAt() };
    }
    const lastAuthorized = await taxAuthority.lastAuthorized({
      token,
      pointOfSale,
      voucherType: FACTURA_C_VOUCHER_TYPE,
    });
    if (lastAuthorized.kind === "no_answer") {
      return { kind: "retry", askAgainAt: askAgainAt() };
    }

    const reconciliation = decideNumberingReconciliation({
      countBeforeFreeze: freeze.countBeforeFreeze,
      lastAuthorized: lastAuthorized.number,
      documents: await lane.documentsInNumberingRange({
        after: freeze.countBeforeFreeze,
        through: lastAuthorized.number,
      }),
    });
    if (reconciliation.kind === "waiting") {
      return { kind: "waiting", askAgainAt: askAgainAt() };
    }

    await lane.settleNumberingReconciliation({
      externalBillings: reconciliation.numbersWithoutOwnDocument.map((number) => ({
        pointOfSale,
        documentType: FACTURA_C_DOCUMENT_TYPE,
        number,
      })),
      lastAuthorized: reconciliation.lastAuthorized,
    });
    return {
      kind: "reconciled",
      lastAuthorized: reconciliation.lastAuthorized,
      alertedNumbers: reconciliation.numbersWithoutOwnDocument,
    };
  });
}
