import type { SaleCreditNote } from "@purosur/contracts";
import type { CreditNoteAnswer } from "@purosur/domain";

export function toWireCreditNote(creditNote: CreditNoteAnswer): SaleCreditNote;
export function toWireCreditNote(creditNote: CreditNoteAnswer | null): SaleCreditNote | null;
export function toWireCreditNote(creditNote: CreditNoteAnswer | null): SaleCreditNote | null {
  return creditNote?.kind === "authorized"
    ? {
        kind: "authorized",
        point_of_sale: creditNote.pointOfSale,
        number: creditNote.number,
        issued_on: creditNote.issuedOn,
        authorization_code: creditNote.authorizationCode,
        authorization_code_due_on: creditNote.authorizationCodeDueOn,
      }
    : creditNote;
}
