import { FACTURA_C_VOUCHER_TYPE } from "../model/factura-c-fiscal-block.js";
import {
  decideNumberingReconciliation,
  NUMBERING_CONFLICT_REASK_INTERVAL_MS,
} from "../model/numbering-conflict.js";
import {
  decideOrphanAuthorization,
  type OrphanRegularization,
  orphanRegularization,
} from "../model/orphan-authorization.js";
import type { ReconcileNumberingConflictPorts } from "./numbering-conflict-ports.js";
import { localStandingBehindVoucher } from "./orphan-local-standing.js";

export interface ReconcileNumberingConflictInput {
  pointOfSale: number;
}

export type ReconcileNumberingConflictOutcome =
  | {
      kind: "reconciled";
      lastAuthorized: number;
      alertedNumbers: number[];
      creditNotedNumbers: number[];
    }
  | { kind: "waiting"; askAgainAt: Date }
  | { kind: "retry"; askAgainAt: Date }
  | { kind: "not_frozen" };

export async function reconcileNumberingConflict(
  { lanes, clock, ids, tokens, vouchers, taxAuthority }: ReconcileNumberingConflictPorts,
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

    const regularizations: OrphanRegularization[] = [];
    for (const number of reconciliation.numbersWithoutOwnDocument) {
      const answer = await vouchers.voucherAt({
        token,
        pointOfSale,
        voucherType: FACTURA_C_VOUCHER_TYPE,
        number,
      });
      if (answer.kind !== "found") {
        return { kind: answer.kind === "none" ? "waiting" : "retry", askAgainAt: askAgainAt() };
      }
      const regularization = orphanRegularization(
        decideOrphanAuthorization({
          evidence: { kind: "confirmed", pointOfSale, number, voucher: answer.voucher },
          local: await localStandingBehindVoucher(lane, { pointOfSale, number }, answer.voucher),
        }),
        { creditNoteId: ids.next(), now: clock.now() },
      );
      if (regularization !== null) {
        regularizations.push(regularization);
      }
    }

    await lane.settleNumberingReconciliation({
      regularizations,
      lastAuthorized: reconciliation.lastAuthorized,
    });
    return {
      kind: "reconciled",
      lastAuthorized: reconciliation.lastAuthorized,
      alertedNumbers: regularizations.flatMap((regularization) =>
        regularization.kind === "external_invoicing" ? [regularization.externalBilling.number] : [],
      ),
      creditNotedNumbers: regularizations.flatMap((regularization) =>
        regularization.kind === "credit_note" ? [regularization.associatedVoucher.number] : [],
      ),
    };
  });
}
