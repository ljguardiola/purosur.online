import { argentinaCalendarDay } from "../../shared/index.js";
import type { ExternalInvoicingVoucher } from "./fiscal-task.js";
import { decideUnclearOutcome, type TaxAuthorityEvidence } from "./unclear-outcome-decision.js";

export const CREDIT_NOTE_C_VOUCHER_TYPE = 13;

export const CREDIT_NOTE_REASONS = ["orphan", "sale_void", "rejected_document"] as const;

export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

export function creditNoteIssueDate(issuedAt: Date): string {
  return argentinaCalendarDay(issuedAt);
}

export function nextCreditNoteNumber(lastAuthorized: number): number {
  return lastAuthorized + 1;
}

export function mayTakeCreditNoteNumber(otherCreditNotes: readonly { kind: string }[]): boolean {
  return otherCreditNotes.every(({ kind }) => kind !== "requested");
}

export interface UnclearCreditNote {
  number: number;
  issuedOn: string;
  total: number;
  receiverTaxStatusCode: number;
}

export type UnclearCreditNoteSettlement =
  | { kind: "adopted"; authorizationCode: string; authorizationCodeDueOn: string }
  | { kind: "released"; foreignVoucher: ExternalInvoicingVoucher | null }
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
  if (verdict.kind === "conflicting" || verdict.kind === "released") {
    return {
      kind: "released",
      foreignVoucher:
        evidence.kind === "voucher"
          ? {
              issuedOn: evidence.voucher.issuedOn,
              total: evidence.voucher.total,
              authorizationCode: evidence.voucher.authorizationCode,
            }
          : null,
    };
  }
  return verdict;
}
