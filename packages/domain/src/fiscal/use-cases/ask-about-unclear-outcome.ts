import { isCompletionEventOfSale } from "../model/real-time-authorization.js";
import type { UnclearOutcomeDecision } from "../model/unclear-outcome-decision.js";
import { FiscalDocumentAlreadyRecorded } from "./fiscal-document-authorization-ports.js";
import type {
  AbandonedRequestRecord,
  AskAboutUnclearOutcomePorts,
} from "./unclear-outcome-ports.js";

export interface AskAboutUnclearOutcomeInput {
  registerId: string;
  request: Omit<AbandonedRequestRecord, "registerId">;
}

export type AskAboutUnclearOutcomeOutcome =
  | { kind: "pending" }
  | { kind: "decided"; decision: UnclearOutcomeDecision }
  | { kind: "point_of_sale_not_owned" }
  | { kind: "fiscal_document_not_owned" }
  | { kind: "sale_event_mismatch" };

export async function askAboutUnclearOutcome(
  { lanes, clock }: AskAboutUnclearOutcomePorts,
  { registerId, request }: AskAboutUnclearOutcomeInput,
): Promise<AskAboutUnclearOutcomeOutcome> {
  if (!isCompletionEventOfSale(request.saleEvent, request.saleId)) {
    return { kind: "sale_event_mismatch" };
  }

  return lanes.inPointOfSaleLane<AskAboutUnclearOutcomeOutcome>(
    request.pointOfSale,
    async (lane) => {
      if (!(await lane.registerOwnsPointOfSale(registerId, request.pointOfSale))) {
        return { kind: "point_of_sale_not_owned" };
      }

      const recorded = await lane.recordedRequest(registerId, request.fiscalDocumentId);
      if (recorded !== null) {
        return recorded.decision === null
          ? { kind: "pending" }
          : { kind: "decided", decision: recorded.decision };
      }

      try {
        await lane.recordAbandonedRequest({ ...request, registerId }, clock.now());
      } catch (error) {
        if (error instanceof FiscalDocumentAlreadyRecorded) {
          return { kind: "fiscal_document_not_owned" };
        }
        throw error;
      }
      return { kind: "pending" };
    },
  );
}
