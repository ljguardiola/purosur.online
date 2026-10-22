import {
  decideOrphanAuthorization,
  localStandingOfUnrecordedSale,
  type OrphanRegularization,
  orphanEvidenceOfRecordedRequest,
  orphanRegularization,
} from "../model/orphan-authorization.js";
import type { SweepRestoredRegisterOrphanAuthorizationsPorts } from "./sweep-restored-register-orphan-authorizations-ports.js";

export interface SweepRestoredRegisterOrphanAuthorizationsInput {
  registerId: string;
}

export type SweepRestoredRegisterOrphanAuthorizationsOutcome =
  | { kind: "swept"; creditNotedNumbers: number[]; alertedNumbers: number[] }
  | { kind: "numbering_not_reconciled" };

export async function sweepRestoredRegisterOrphanAuthorizations(
  { points, lanes, clock, ids }: SweepRestoredRegisterOrphanAuthorizationsPorts,
  { registerId }: SweepRestoredRegisterOrphanAuthorizationsInput,
): Promise<SweepRestoredRegisterOrphanAuthorizationsOutcome> {
  const regularized: OrphanRegularization[] = [];
  for (const pointOfSale of await points.fiscalPointsOfSaleOf(registerId)) {
    const reconciled = await lanes.inPointOfSaleLane(pointOfSale, async (lane) => {
      if ((await lane.numberingFreeze()) !== null) {
        return false;
      }
      for (const request of await lane.requestsWithoutRecordedSale()) {
        const atNumber = await lane.requestsAtNumber({ pointOfSale, number: request.number });
        if (atNumber.kind === "already_regularized") {
          continue;
        }
        const regularization = orphanRegularization(
          decideOrphanAuthorization({
            evidence: orphanEvidenceOfRecordedRequest({ pointOfSale, request }),
            local: localStandingOfUnrecordedSale(
              request.saleId,
              await lane.otherDocumentsOfSale(request.saleId, request.fiscalDocumentId),
            ),
          }),
          { creditNoteId: ids.next(), now: clock.now() },
        );
        if (regularization !== null) {
          await lane.recordOrphanRegularization(regularization);
          regularized.push(regularization);
        }
      }
      return true;
    });
    if (!reconciled) {
      return { kind: "numbering_not_reconciled" };
    }
  }
  return {
    kind: "swept",
    creditNotedNumbers: regularized.flatMap((regularization) =>
      regularization.kind === "credit_note" ? [regularization.associatedVoucher.number] : [],
    ),
    alertedNumbers: regularized.flatMap((regularization) =>
      regularization.kind === "external_invoicing" ? [regularization.externalBilling.number] : [],
    ),
  };
}
