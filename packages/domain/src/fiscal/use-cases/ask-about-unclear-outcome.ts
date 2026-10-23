import { isCompletionEventOfSale } from "../model/real-time-authorization.js";
import {
  type OutcomeToldToAskingRegister,
  outcomeToldToAskingRegister,
} from "../model/unclear-outcome-decision.js";
import { FiscalDocumentAlreadyRecorded } from "./fiscal-document-authorization-ports.js";
import type {
  AbandonedRequestRecord,
  AskAboutUnclearOutcomePorts,
} from "./unclear-outcome-ports.js";

export interface AskAboutUnclearOutcomeInput {
  deviceId: string;
  registerId: string;
  request: Omit<AbandonedRequestRecord, "registerId">;
}

export type AskAboutUnclearOutcomeOutcome =
  | OutcomeToldToAskingRegister
  | { kind: "point_of_sale_not_owned" }
  | { kind: "fiscal_document_not_owned" }
  | { kind: "sale_event_mismatch" }
  | { kind: "sale_completion_not_held" };

export async function askAboutUnclearOutcome(
  { lanes, saleCompletions, attachedSaleEvents, clock }: AskAboutUnclearOutcomePorts,
  { deviceId, registerId, request }: AskAboutUnclearOutcomeInput,
): Promise<AskAboutUnclearOutcomeOutcome> {
  if (request.saleEvent !== null && !isCompletionEventOfSale(request.saleEvent, request.saleId)) {
    return { kind: "sale_event_mismatch" };
  }
  if (request.saleEvent !== null) {
    await attachedSaleEvents.record(deviceId, request.saleEvent);
  }

  return lanes.inPointOfSaleLane<AskAboutUnclearOutcomeOutcome>(
    request.pointOfSale,
    async (lane) => {
      if (!(await lane.registerOwnsPointOfSale(registerId, request.pointOfSale))) {
        return { kind: "point_of_sale_not_owned" };
      }

      const recorded = await lane.recordedRequest(registerId, request.fiscalDocumentId);
      if (recorded !== null) {
        return outcomeToldToAskingRegister(recorded);
      }

      if (
        request.saleEvent === null &&
        !(await saleCompletions.holdsCompletionOf(registerId, request.saleId))
      ) {
        return { kind: "sale_completion_not_held" };
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
