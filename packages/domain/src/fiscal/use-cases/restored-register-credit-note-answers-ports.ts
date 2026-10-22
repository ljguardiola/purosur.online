import type { CreditNoteStanding } from "../model/sale-void-credit-note.js";

export interface SaleVoidCreditNoteOfRegister {
  creditNoteId: string;
  pointOfSale: number;
  standing: CreditNoteStanding;
  answeredAt: Date | null;
}

export interface KeptAlreadyCreditedRefusalOfRegister {
  creditNoteId: string;
  refusedAt: Date;
}

export interface RestoredRegisterCreditNoteAnswers {
  saleVoidCreditNotesOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<SaleVoidCreditNoteOfRegister[]>;
  keptRefusalsOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<KeptAlreadyCreditedRefusalOfRegister[]>;
}

export interface ServeRestoredRegisterCreditNoteAnswersPorts {
  creditNotes: RestoredRegisterCreditNoteAnswers;
}
