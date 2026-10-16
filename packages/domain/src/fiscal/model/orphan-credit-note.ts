import { argentinaCalendarDay } from "../../shared/index.js";
import { decideUnclearOutcome, type TaxAuthorityEvidence } from "./unclear-outcome-decision.js";

export const CREDIT_NOTE_C_VOUCHER_TYPE = 13;

export function creditNoteIssueDate(issuedAt: Date): string {
  return argentinaCalendarDay(issuedAt);
}

export function nextCreditNoteNumber(lastAuthorized: number): number {
  return lastAuthorized + 1;
}

export interface UnclearCreditNote {
  number: number;
  issuedOn: string;
  total: number;
  receiverTaxStatusCode: number;
}

export type UnclearCreditNoteSettlement =
  | { kind: "adopted"; authorizationCode: string; authorizationCodeDueOn: string }
  | { kind: "released" }
  | { kind: "pending"; askAgainAt: Date };

export function settleUnclearCreditNote({
  unclearSince,
  now,
  creditNote: { number, issuedOn, total, receiverTaxStatusCode },
  evidence,
}: {
  unclearSince: Date;
  now: Date;
  creditNote: UnclearCreditNote;
  evidence: TaxAuthorityEvidence;
}): UnclearCreditNoteSettlement {
  const verdict = decideUnclearOutcome({
    abandonedAt: unclearSince,
    now,
    document: { number, issuedOn, total, buyerTaxStatusCode: receiverTaxStatusCode },
    evidence,
    voucherType: CREDIT_NOTE_C_VOUCHER_TYPE,
  });
  return verdict.kind === "conflicting" ? { kind: "released" } : verdict;
}
