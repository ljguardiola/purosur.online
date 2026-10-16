import { FACTURA_C_VOUCHER_TYPE } from "../model/factura-c-fiscal-block.js";
import {
  decideOrphanAuthorization,
  type OrphanRegularization,
  orphanRegularization,
} from "../model/orphan-authorization.js";
import { UNCLEAR_OUTCOME_REASK_INTERVAL_MS } from "../model/unclear-outcome-decision.js";
import type {
  AuthorizationNumber,
  RegularizeOrphanAuthorizationPorts,
} from "./orphan-authorization-ports.js";

export type RegularizeOrphanAuthorizationInput = AuthorizationNumber;

export type RegularizeOrphanAuthorizationOutcome =
  | { kind: "regularized"; regularization: OrphanRegularization }
  | { kind: "nothing_to_regularize" }
  | { kind: "not_confirmed" }
  | { kind: "retry"; askAgainAt: Date };

export async function regularizeOrphanAuthorization(
  { lanes, clock, ids, tokens, vouchers }: RegularizeOrphanAuthorizationPorts,
  { pointOfSale, number }: RegularizeOrphanAuthorizationInput,
): Promise<RegularizeOrphanAuthorizationOutcome> {
  return lanes.inPointOfSaleLane<RegularizeOrphanAuthorizationOutcome>(
    pointOfSale,
    async (lane) => {
      const retry = (): RegularizeOrphanAuthorizationOutcome => ({
        kind: "retry",
        askAgainAt: new Date(clock.now().getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
      });
      const token = await tokens.validToken();
      if (token === null) {
        return retry();
      }
      const answer = await vouchers.voucherAt({
        token,
        pointOfSale,
        voucherType: FACTURA_C_VOUCHER_TYPE,
        number,
      });
      if (answer.kind === "no_answer") {
        return retry();
      }
      if (answer.kind === "none") {
        return { kind: "not_confirmed" };
      }

      const decision = decideOrphanAuthorization({
        evidence: { kind: "confirmed", pointOfSale, number, voucher: answer.voucher },
        local: await lane.localStandingOfAuthorization({ pointOfSale, number }),
      });
      const regularization = orphanRegularization(decision, {
        creditNoteId: ids.next(),
        now: clock.now(),
      });
      if (regularization === null) {
        return { kind: "nothing_to_regularize" };
      }
      await lane.recordOrphanRegularization(regularization);
      return { kind: "regularized", regularization };
    },
  );
}
