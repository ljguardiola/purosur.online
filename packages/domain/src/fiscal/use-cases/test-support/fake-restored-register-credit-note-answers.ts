import type {
  IssuedOfflineCreditNoteOfRegister,
  KeptAlreadyCreditedRefusalOfRegister,
  RestoredRegisterCreditNoteAnswers,
  SaleCreditNoteOfRegister,
} from "../restored-register-credit-note-answers-ports.js";

export interface StoredSaleVoidCreditNote extends SaleCreditNoteOfRegister {
  registerId: string;
}

export interface StoredAlreadyCreditedRefusal extends KeptAlreadyCreditedRefusalOfRegister {
  registerId: string;
}

export interface StoredOfflineCreditNote extends IssuedOfflineCreditNoteOfRegister {
  registerId: string;
}

export interface CreditNotesRead {
  registerId: string;
  creditNoteIds: readonly string[];
}

export class FakeRestoredRegisterCreditNoteAnswers implements RestoredRegisterCreditNoteAnswers {
  creditNotes: StoredSaleVoidCreditNote[] = [];
  refusals: StoredAlreadyCreditedRefusal[] = [];
  offlineCreditNotes: StoredOfflineCreditNote[] = [];
  reads: CreditNotesRead[] = [];

  async saleCreditNotesOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<SaleCreditNoteOfRegister[]> {
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

  async issuedOfflineOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<IssuedOfflineCreditNoteOfRegister[]> {
    return this.offlineCreditNotes
      .filter((note) => note.registerId === registerId && creditNoteIds.includes(note.creditNoteId))
      .map(({ registerId: _registerId, ...note }) => note);
  }
}
