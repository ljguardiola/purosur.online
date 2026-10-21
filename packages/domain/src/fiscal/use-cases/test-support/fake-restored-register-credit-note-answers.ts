import type {
  RestoredRegisterCreditNoteAnswers,
  SaleVoidCreditNoteOfRegister,
} from "../restored-register-credit-note-answers-ports.js";

export interface StoredSaleVoidCreditNote extends SaleVoidCreditNoteOfRegister {
  registerId: string;
  saleId: string;
}

export interface SaleVoidCreditNotesRead {
  registerId: string;
  saleIds: readonly string[];
}

export class FakeRestoredRegisterCreditNoteAnswers implements RestoredRegisterCreditNoteAnswers {
  creditNotes: StoredSaleVoidCreditNote[] = [];
  reads: SaleVoidCreditNotesRead[] = [];

  async saleVoidCreditNotesOf(
    registerId: string,
    saleIds: readonly string[],
  ): Promise<SaleVoidCreditNoteOfRegister[]> {
    this.reads.push({ registerId, saleIds });
    return this.creditNotes
      .filter((note) => note.registerId === registerId && saleIds.includes(note.saleId))
      .map(({ registerId: _registerId, saleId: _saleId, ...note }) => note);
  }
}
