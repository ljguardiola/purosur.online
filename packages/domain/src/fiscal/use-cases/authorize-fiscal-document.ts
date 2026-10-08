import type { PushedEvent } from "../../sync/index.js";
import {
  authorizationCallDeadline,
  isCompletionEventOfSale,
  mayStartAuthorizationCall,
  type RealTimeAuthorizationAnswer,
  taxAuthorityRejectionAnswer,
} from "../model/real-time-authorization.js";
import type {
  AuthorizeFiscalDocumentPorts,
  FiscalDocumentData,
  SolicitationAnswer,
} from "./fiscal-document-authorization-ports.js";

export interface FiscalDocumentAuthorizationRequest extends FiscalDocumentData {
  fiscalDocumentId: string;
  saleId: string;
  timeoutMs: number;
  roundTripMedianMs: number;
  saleEvent: PushedEvent;
}

export interface AuthorizeFiscalDocumentInput {
  registerId: string;
  request: FiscalDocumentAuthorizationRequest;
  receivedAt: Date;
}

export type AuthorizeFiscalDocumentOutcome =
  | { kind: "answered"; answer: RealTimeAuthorizationAnswer }
  | { kind: "point_of_sale_not_owned" }
  | { kind: "fiscal_document_not_owned" }
  | { kind: "sale_event_mismatch" };

function answerOf(answer: SolicitationAnswer): RealTimeAuthorizationAnswer {
  switch (answer.kind) {
    case "authorized":
      return answer;
    case "rejected":
      return taxAuthorityRejectionAnswer(answer.codes);
    case "no_answer":
      return { kind: "unclear" };
  }
}

export async function authorizeFiscalDocument(
  { lanes, clock, tokens, taxAuthority, evidence }: AuthorizeFiscalDocumentPorts,
  { registerId, request, receivedAt }: AuthorizeFiscalDocumentInput,
): Promise<AuthorizeFiscalDocumentOutcome> {
  if (!isCompletionEventOfSale(request.saleEvent, request.saleId)) {
    return { kind: "sale_event_mismatch" };
  }

  return lanes.inPointOfSaleLane<AuthorizeFiscalDocumentOutcome>(
    request.pointOfSale,
    async (lane) => {
      if (!(await lane.registerOwnsPointOfSale(registerId, request.pointOfSale))) {
        return { kind: "point_of_sale_not_owned" };
      }

      const recorded = await lane.recordedRequest(registerId, request.fiscalDocumentId);
      if (recorded?.kind === "another_register") {
        return { kind: "fiscal_document_not_owned" };
      }
      if (recorded !== null) {
        return { kind: "answered", answer: recorded.answer ?? { kind: "unclear" } };
      }

      const notAfter = authorizationCallDeadline({
        receivedAt,
        timeoutMs: request.timeoutMs,
        roundTripMedianMs: request.roundTripMedianMs,
      });
      await lane.recordRequest({
        fiscalDocumentId: request.fiscalDocumentId,
        registerId,
        saleId: request.saleId,
        pointOfSale: request.pointOfSale,
        number: request.number,
        issuedOn: request.issuedOn,
        total: request.total,
        buyerTaxStatusCode: request.buyerTaxStatusCode,
        notAfter,
        saleEvent: request.saleEvent,
        receivedAt,
      });

      const token = await tokens.validToken();
      if (token === null || !mayStartAuthorizationCall(notAfter, clock.now())) {
        const answer: RealTimeAuthorizationAnswer = { kind: "not_attempted" };
        await lane.recordAnswer(request.fiscalDocumentId, answer, clock.now());
        return { kind: "answered", answer };
      }

      const solicitation = await taxAuthority.solicit({
        token,
        pointOfSale: request.pointOfSale,
        number: request.number,
        issuedOn: request.issuedOn,
        total: request.total,
        buyerTaxStatusCode: request.buyerTaxStatusCode,
      });
      const answeredAt = clock.now();
      const answer = answerOf(solicitation);
      await lane.recordAnswer(request.fiscalDocumentId, answer, answeredAt);
      if (solicitation.kind !== "no_answer") {
        await evidence.recordInvoicingCallOk(answeredAt);
      }
      return { kind: "answered", answer };
    },
  );
}
