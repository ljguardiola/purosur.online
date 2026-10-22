import type { DeferredSale } from "./deferred-sale.js";
import type { UnclearDeferralDocument } from "./deferred-sale-recorded-event.js";
import type { FacturaC } from "./pre-emission-gate.js";
import {
  outcomeToldToAskingRegister,
  type RecordedRequestOutcome,
  unclearDocumentSettlement,
} from "./unclear-outcome-decision.js";

export type RestoredUnclearDeferralAnswer =
  | { kind: "unsettled" }
  | { kind: "rejected"; answeredAt: Date }
  | {
      kind: "authorized";
      authorizationCode: string;
      authorizationCodeDueOn: string;
      answeredAt: Date;
    };

export interface RestoredUnclearDeferral {
  fiscalDocumentId: string;
  answer: RestoredUnclearDeferralAnswer;
}

const UNSETTLED: RestoredUnclearDeferralAnswer = { kind: "unsettled" };

export function restoredUnclearDeferralAnswer(
  recorded: RecordedRequestOutcome | null,
  instants: { answeredAt: Date | null; decidedAt: Date | null },
): RestoredUnclearDeferralAnswer {
  if (recorded === null) {
    return UNSETTLED;
  }
  const told = outcomeToldToAskingRegister(recorded);
  if (told.kind === "pending") {
    return UNSETTLED;
  }
  const answeredAt = told.kind === "answered" ? instants.answeredAt : instants.decidedAt;
  if (answeredAt === null) {
    return UNSETTLED;
  }
  const settlement = unclearDocumentSettlement(told);
  switch (settlement.state) {
    case "AUTHORIZED":
      return {
        kind: "authorized",
        authorizationCode: settlement.authorizationCode,
        authorizationCodeDueOn: settlement.authorizationCodeDueOn,
        answeredAt,
      };
    case "REJECTED":
      return { kind: "rejected", answeredAt };
    case "UNKNOWN":
    case "RELEASED":
    case "CONFLICTING":
      return UNSETTLED;
  }
}

export interface RebuiltAuthorizedDocument {
  id: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  authorizationCode: string;
  authorizationCodeDueOn: string;
  reservedAt: Date;
  satisfiedAt: Date;
}

export interface RebuiltUnclearDeferral {
  deferredSale: DeferredSale;
  authorizedDocument: RebuiltAuthorizedDocument | null;
}

export function rebuiltUnclearDeferral(
  deferredSale: DeferredSale,
  unclearDocument: UnclearDeferralDocument,
  answer: RestoredUnclearDeferralAnswer,
): RebuiltUnclearDeferral {
  switch (answer.kind) {
    case "unsettled":
      return { deferredSale, authorizedDocument: null };
    case "rejected":
      return { deferredSale: { ...deferredSale, reason: "rejected" }, authorizedDocument: null };
    case "authorized":
      return {
        deferredSale,
        authorizedDocument: {
          id: unclearDocument.fiscalDocumentId,
          saleId: deferredSale.saleId,
          pointOfSale: unclearDocument.pointOfSale,
          number: unclearDocument.number,
          issuedOn: unclearDocument.issuedOn,
          document: unclearDocument.document,
          authorizationCode: answer.authorizationCode,
          authorizationCodeDueOn: answer.authorizationCodeDueOn,
          reservedAt: unclearDocument.reservedAt,
          satisfiedAt: answer.answeredAt,
        },
      };
  }
}
