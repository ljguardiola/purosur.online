import type { SaleCreditNote } from "@purosur/contracts";
import type { VoidCreditNoteStanding } from "@purosur/domain";

export function toWireCreditNote(creditNote: VoidCreditNoteStanding): SaleCreditNote;
export function toWireCreditNote(creditNote: VoidCreditNoteStanding | null): SaleCreditNote | null;
export function toWireCreditNote(creditNote: VoidCreditNoteStanding | null): SaleCreditNote | null {
  switch (creditNote?.kind) {
    case "authorized":
      return {
        kind: "authorized",
        point_of_sale: creditNote.pointOfSale,
        number: creditNote.number,
        issued_on: creditNote.issuedOn,
        authorization_code: creditNote.authorizationCode,
        authorization_code_due_on: creditNote.authorizationCodeDueOn,
      };
    case "issued_offline":
      return {
        kind: "issued_offline",
        point_of_sale: creditNote.pointOfSale,
        number: creditNote.number,
        issued_on: creditNote.issuedOn,
        offline_authorization_code: creditNote.offlineAuthorizationCode,
        fortnight_start: creditNote.fortnight.start,
        fortnight_end: creditNote.fortnight.end,
      };
    case "regularization_required":
      return { kind: "in_progress" };
    default:
      return creditNote ?? null;
  }
}
