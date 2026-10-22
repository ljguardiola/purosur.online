import type {
  KeptAlreadyCreditedRefusalOfRegister,
  RestoredRegisterCreditNoteAnswers,
  SaleVoidCreditNoteOfRegister,
} from "../restored-register-credit-note-answers-ports.js";

export interface StoredSaleVoidCreditNote extends SaleVoidCreditNoteOfRegister {
  registerId: string;
}

export interface StoredAlreadyCreditedRefusal extends KeptAlreadyCreditedRefusalOfRegister {
  registerId: string;
}

export interface CreditNotesRead {
  registerId: string;
  creditNoteIds: readonly string[];
}

export class FakeRestoredRegisterCreditNoteAnswers implements RestoredRegisterCreditNoteAnswers {
  creditNotes: StoredSaleVoidCreditNote[] = [];
  refusals: StoredAlreadyCreditedRefusal[] = [];
  reads: CreditNotesRead[] = [];

  async saleVoidCreditNotesOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<SaleVoidCreditNoteOfRegister[]> {
    this.reads.push({ registerId, creditNoteIds });
    return this.creditNotes
      .filter((note) => note.registerId === registerId && creditNoteIds.includes(note.creditNoteId))
      .map(({ registerId: _registerId, ...note }) => note);
  }

  async keptRefusalsOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<KeptAlreadyCreditedRefusalOfRegister[]> {
    return this.refusals
      .filter(
        (refusal) =>
          refusal.registerId === registerId && creditNoteIds.includes(refusal.creditNoteId),
      )
      .map(({ registerId: _registerId, ...refusal }) => refusal);
  }
}
