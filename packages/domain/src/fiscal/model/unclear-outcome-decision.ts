import {
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
} from "./factura-c-fiscal-block.js";

export const UNCLEAR_OUTCOME_SETTLING_DELAY_MS = 60_000;
export const UNCLEAR_OUTCOME_REASK_INTERVAL_MS = 30_000;

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
  const settlesAt = unclearOutcomeSettlesAt(abandonedAt);
  if (now.getTime() < settlesAt.getTime()) {
    return { kind: "pending", askAgainAt: settlesAt };
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
