import {
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
} from "./factura-c-fiscal-block.js";
import {
  type RealTimeAuthorizationAnswer,
  type RealTimeAuthorizationResolution,
  realTimeAuthorizationResolution,
} from "./real-time-authorization.js";

export const UNCLEAR_OUTCOME_SETTLING_DELAY_MS = 60_000;
export const UNCLEAR_OUTCOME_REASK_INTERVAL_MS = 30_000;

export const UNCLEAR_ANSWER_KINDS: readonly RealTimeAuthorizationAnswer["kind"][] = [
  "unclear",
  "not_attempted",
];

export function awaitsUnclearOutcomeDecision(answer: RealTimeAuthorizationAnswer | null): boolean {
  return answer === null || UNCLEAR_ANSWER_KINDS.includes(answer.kind);
}

export function unclearOutcomeSince({
  answer,
  answeredAt,
  notAfter,
  decision,
}: {
  answer: RealTimeAuthorizationAnswer | null;
  answeredAt: Date | null;
  notAfter: Date;
  decision: UnclearOutcomeDecision | null;
}): Date | null {
  if (decision !== null || !awaitsUnclearOutcomeDecision(answer)) {
    return null;
  }
  return answeredAt ?? notAfter;
}

export interface TaxAuthorityVoucher {
  issuedOn: string;
  total: number;
  documentType: number;
  receiverDocumentType: number;
  receiverDocumentNumber: number;
  receiverTaxStatusCode: number;
  authorizationCode: string;
  authorizationCodeDueOn: string;
}

export interface UnclearDocument {
  number: number;
  issuedOn: string;
  total: number;
  buyerTaxStatusCode: number;
}

export type UnclearOutcomeDecision =
  | { kind: "released" }
  | { kind: "adopted"; authorizationCode: string; authorizationCodeDueOn: string }
  | { kind: "conflicting" };

export interface RecordedRequestOutcome {
  answer: RealTimeAuthorizationAnswer | null;
  decision: UnclearOutcomeDecision | null;
}

export type ClearAuthorizationAnswer = Extract<
  RealTimeAuthorizationAnswer,
  { kind: "authorized" | "rejected" }
>;

function isClearAuthorizationAnswer(
  answer: RealTimeAuthorizationAnswer | null,
): answer is ClearAuthorizationAnswer {
  return !awaitsUnclearOutcomeDecision(answer);
}

export type OutcomeToldToAskingRegister =
  | { kind: "answered"; answer: ClearAuthorizationAnswer }
  | { kind: "decided"; decision: UnclearOutcomeDecision }
  | { kind: "pending" };

export function outcomeToldToAskingRegister({
  answer,
  decision,
}: RecordedRequestOutcome): OutcomeToldToAskingRegister {
  if (isClearAuthorizationAnswer(answer)) {
    return { kind: "answered", answer };
  }
  return decision === null ? { kind: "pending" } : { kind: "decided", decision };
}

export type UnclearDocumentSettlement =
  | RealTimeAuthorizationResolution
  | { state: "RELEASED" }
  | { state: "CONFLICTING" };

export function unclearDocumentSettlement(
  told: Exclude<OutcomeToldToAskingRegister, { kind: "pending" }>,
): UnclearDocumentSettlement {
  if (told.kind === "answered") {
    return realTimeAuthorizationResolution(told.answer);
  }
  switch (told.decision.kind) {
    case "released":
      return { state: "RELEASED" };
    case "conflicting":
      return { state: "CONFLICTING" };
    case "adopted":
      return {
        state: "AUTHORIZED",
        authorizationCode: told.decision.authorizationCode,
        authorizationCodeDueOn: told.decision.authorizationCodeDueOn,
      };
  }
}

export type UnclearOutcomeVerdict = UnclearOutcomeDecision | { kind: "pending"; askAgainAt: Date };

export type TaxAuthorityEvidence =
  | { kind: "voucher"; voucher: TaxAuthorityVoucher }
  | { kind: "no_voucher"; lastAuthorized: number | null }
  | { kind: "no_answer" };

export interface DecideUnclearOutcomeInput {
  abandonedAt: Date;
  now: Date;
  document: UnclearDocument;
  evidence: TaxAuthorityEvidence;
}

export function unclearOutcomeSettlesAt(abandonedAt: Date): Date {
  return new Date(abandonedAt.getTime() + UNCLEAR_OUTCOME_SETTLING_DELAY_MS);
}

export function hasUnclearOutcomeSettled(abandonedAt: Date, now: Date): boolean {
  return now.getTime() >= unclearOutcomeSettlesAt(abandonedAt).getTime();
}

export function voucherMatchesDocument(
  voucher: TaxAuthorityVoucher,
  document: Omit<UnclearDocument, "number">,
): boolean {
  return (
    voucher.issuedOn === document.issuedOn &&
    voucher.total === document.total &&
    voucher.documentType === FACTURA_C_VOUCHER_TYPE &&
    voucher.receiverDocumentType === FINAL_CONSUMER_DOCUMENT_TYPE &&
    voucher.receiverDocumentNumber === FINAL_CONSUMER_DOCUMENT_NUMBER &&
    voucher.receiverTaxStatusCode === document.buyerTaxStatusCode
  );
}

export function decideUnclearOutcome({
  abandonedAt,
  now,
  document,
  evidence,
}: DecideUnclearOutcomeInput): UnclearOutcomeVerdict {
  if (!hasUnclearOutcomeSettled(abandonedAt, now)) {
    return { kind: "pending", askAgainAt: unclearOutcomeSettlesAt(abandonedAt) };
  }
  if (evidence.kind === "voucher") {
    return voucherMatchesDocument(evidence.voucher, document)
      ? {
          kind: "adopted",
          authorizationCode: evidence.voucher.authorizationCode,
          authorizationCodeDueOn: evidence.voucher.authorizationCodeDueOn,
        }
      : { kind: "conflicting" };
  }
  if (
    evidence.kind === "no_voucher" &&
    evidence.lastAuthorized !== null &&
    evidence.lastAuthorized < document.number
  ) {
    return { kind: "released" };
  }
  return {
    kind: "pending",
    askAgainAt: new Date(now.getTime() + UNCLEAR_OUTCOME_REASK_INTERVAL_MS),
  };
}
