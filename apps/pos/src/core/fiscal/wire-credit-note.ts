import type { SaleCreditNote } from "@purosur/contracts";
import type { VoidCreditNoteStanding } from "@purosur/domain";

export function toWireCreditNote(creditNote: VoidCreditNoteStanding): SaleCreditNote;
export function toWireCreditNote(creditNote: VoidCreditNoteStanding | null): SaleCreditNote | null;
export function toWireCreditNote(creditNote: VoidCreditNoteStanding | null): SaleCreditNote | null {
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
