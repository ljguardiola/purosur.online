import type { PushedEvent } from "../../sync/index.js";
import {
  FACTURA_C_DOCUMENT_TYPE,
  rejectionAlertChange,
  type TaxAuthorityRejection,
} from "../model/fiscal-rejection-alert.js";
import {
  authorizationCallDeadline,
  isCompletionEventOfSale,
  mayStartAuthorizationCall,
  type RealTimeAuthorizationAnswer,
  taxAuthorityRefusalAnswer,
  taxAuthorityRejectionAnswer,
} from "../model/real-time-authorization.js";
import {
  type AuthorizeFiscalDocumentPorts,
  FiscalDocumentAlreadyRecorded,
  type FiscalDocumentData,
  type SolicitationAnswer,
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
      return taxAuthorityRejectionAnswer(answer.rejections.map(({ code }) => code));
    case "refused_without_result":
      return taxAuthorityRefusalAnswer(answer.rejections.map(({ code }) => code));
    case "no_answer":
      return { kind: "unclear" };
  }
}

function rejectionsOf(solicitation: SolicitationAnswer): readonly TaxAuthorityRejection[] {
  return solicitation.kind === "rejected" || solicitation.kind === "refused_without_result"
    ? solicitation.rejections
    : [];
}

function taxAuthorityGaveAnswer(
  solicitation: SolicitationAnswer,
  answer: RealTimeAuthorizationAnswer,
): boolean {
  return (
    solicitation.kind === "authorized" ||
    solicitation.kind === "rejected" ||
    answer.kind === "rejected"
  );
}

export async function authorizeFiscalDocument(
  { lanes, clock, tokens, taxAuthority }: AuthorizeFiscalDocumentPorts,
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
      if (recorded !== null) {
        return { kind: "answered", answer: recorded.answer ?? { kind: "unclear" } };
      }

      const notAfter = authorizationCallDeadline({
        receivedAt,
        timeoutMs: request.timeoutMs,
        roundTripMedianMs: request.roundTripMedianMs,
      });
      try {
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
      } catch (error) {
        if (error instanceof FiscalDocumentAlreadyRecorded) {
          return { kind: "fiscal_document_not_owned" };
        }
        throw error;
      }

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
      if (taxAuthorityGaveAnswer(solicitation, answer)) {
        await lane.recordTaxAuthorityAnswer(
          request.fiscalDocumentId,
          answer,
          answeredAt,
          rejectionAlertChange(answer, rejectionsOf(solicitation), {
            pointOfSale: request.pointOfSale,
            documentType: FACTURA_C_DOCUMENT_TYPE,
            fiscalDocumentId: request.fiscalDocumentId,
            saleId: request.saleId,
          }),
        );
      } else {
        await lane.recordAnswer(request.fiscalDocumentId, answer, answeredAt);
      }
      return { kind: "answered", answer };
    },
  );
}
