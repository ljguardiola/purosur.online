import type { CreditNoteIssuedOffline, CreditNoteStanding } from "../model/sale-credit-note.js";

export interface SaleCreditNoteOfRegister {
  creditNoteId: string;
  pointOfSale: number;
  standing: CreditNoteStanding;
  answeredAt: Date | null;
}

export interface KeptAlreadyCreditedRefusalOfRegister {
  creditNoteId: string;
  refusedAt: Date;
}

export interface IssuedOfflineCreditNoteOfRegister extends Omit<CreditNoteIssuedOffline, "kind"> {
  creditNoteId: string;
}

export interface RestoredRegisterCreditNoteAnswers {
  saleCreditNotesOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<SaleCreditNoteOfRegister[]>;
  keptRefusalsOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<KeptAlreadyCreditedRefusalOfRegister[]>;
  /**
   * The credit notes of the voids that the register itself issued offline and the cloud holds:
   * their credit note id is the id of the void's credit note.
   */
  issuedOfflineOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<IssuedOfflineCreditNoteOfRegister[]>;
}

export interface ServeRestoredRegisterCreditNoteAnswersPorts {
  creditNotes: RestoredRegisterCreditNoteAnswers;
}
