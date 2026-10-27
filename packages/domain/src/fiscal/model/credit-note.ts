import { argentinaCalendarDay, type ZoneRules } from "../../shared/index.js";
import type { ExternalInvoicingVoucher } from "./fiscal-task.js";
import { decideUnclearOutcome, type TaxAuthorityEvidence } from "./unclear-outcome-decision.js";

export const CREDIT_NOTE_C_VOUCHER_TYPE = 13;

export const CREDIT_NOTE_REASONS = [
  "orphan",
  "sale_void",
  "sale_return",
  "rejected_document",
] as const;

export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

export function creditNoteIssueDate(issuedAt: Date, rules: ZoneRules): string {
  return argentinaCalendarDay(issuedAt, rules);
}

export function nextCreditNoteNumber(lastAuthorized: number): number {
  return lastAuthorized + 1;
}

export function creditNoteBreaksDateOrder(
  issuedOn: string,
  otherCreditNotes: readonly { kind: string; issuedOn?: string }[],
): boolean {
  return otherCreditNotes.some(
    (other) =>
      other.kind === "authorized" && other.issuedOn !== undefined && other.issuedOn > issuedOn,
  );
}

const CREDIT_NOTE_ANSWERS_CREDITING_NOTHING: readonly string[] = [
  "rejected",
  "regularization_required",
];

export function creditsItsInvoice(answerKind: string | null): boolean {
  return answerKind === null || !CREDIT_NOTE_ANSWERS_CREDITING_NOTHING.includes(answerKind);
}

export function creditWithinInvoice({
  invoiceTotal,
  alreadyCredited,
  asked,
}: {
  invoiceTotal: number | null;
  alreadyCredited: number;
  asked: number;
}): boolean {
  if (invoiceTotal === null) {
    return true;
  }
  return asked <= (creditLeftOnInvoice({ invoiceTotal, alreadyCredited }) ?? 0);
}

export function creditLeftOnInvoice({
  invoiceTotal,
  alreadyCredited,
}: {
  invoiceTotal: number;
  alreadyCredited: number;
}): number | null {
  const left = invoiceTotal - alreadyCredited;
  return left > 0 ? left : null;
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
