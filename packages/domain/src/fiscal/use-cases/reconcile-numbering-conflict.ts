import { FACTURA_C_DOCUMENT_TYPE } from "../model/fiscal-rejection-standing.js";
import { decideNumberingReconciliation } from "../model/numbering-conflict.js";
import type { ReconcileNumberingConflictPorts } from "./numbering-conflict-ports.js";

export interface ReconcileNumberingConflictInput {
  pointOfSale: number;
}

export type ReconcileNumberingConflictOutcome =
  | { kind: "reconciled"; lastAuthorized: number; alertedNumbers: number[] }
  | { kind: "waiting" }
  | { kind: "retry" }
  | { kind: "not_frozen" };

export async function reconcileNumberingConflict(
  { lanes, tokens, taxAuthority }: ReconcileNumberingConflictPorts,
  { pointOfSale }: ReconcileNumberingConflictInput,
): Promise<ReconcileNumberingConflictOutcome> {
  return lanes.inPointOfSaleLane<ReconcileNumberingConflictOutcome>(pointOfSale, async (lane) => {
    const freeze = await lane.numberingFreeze();
    if (freeze === null) {
      return { kind: "not_frozen" };
    }

    const token = await tokens.validToken();
    if (token === null) {
      return { kind: "retry" };
    }
    const lastAuthorized = await taxAuthority.lastAuthorized({ token, pointOfSale });
    if (lastAuthorized.kind === "no_answer") {
      return { kind: "retry" };
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
      return reconciliation;
    }

    for (const number of reconciliation.numbersWithoutOwnDocument) {
      await lane.openExternalBillingAlert({
        pointOfSale,
        documentType: FACTURA_C_DOCUMENT_TYPE,
        number,
      });
    }
    await lane.continueNumberingAfter(reconciliation.lastAuthorized);
    await lane.liftNumberingFreeze();
    return {
      kind: "reconciled",
      lastAuthorized: reconciliation.lastAuthorized,
      alertedNumbers: reconciliation.numbersWithoutOwnDocument,
    };
  });
}
