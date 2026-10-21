import type { CreditNoteStanding } from "../model/sale-void-credit-note.js";

export interface SaleVoidCreditNoteOfRegister {
  creditNoteId: string;
  pointOfSale: number;
  standing: CreditNoteStanding;
  answeredAt: Date | null;
}

export interface RestoredRegisterCreditNoteAnswers {
  saleVoidCreditNotesOf(
    registerId: string,
    saleIds: readonly string[],
  ): Promise<SaleVoidCreditNoteOfRegister[]>;
}

export interface ServeRestoredRegisterCreditNoteAnswersPorts {
  creditNotes: RestoredRegisterCreditNoteAnswers;
}
