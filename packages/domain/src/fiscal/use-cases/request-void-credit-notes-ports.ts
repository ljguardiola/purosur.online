import type { Clock } from "../../shared/index.js";
import type { PushedEvent } from "../../sync/index.js";
import type { SaleVoidCreditNote, VoidCreditNoteStanding } from "../model/sale-void-credit-note.js";

export interface PendingCreditNote extends SaleVoidCreditNote {
  saleEvent: PushedEvent;
}

export interface RegisterVoidCreditNotes {
  inProgress(): Promise<PendingCreditNote[]>;
  realTimePointOfSale(): Promise<number | null>;
  recordAnswer(
    creditNoteId: string,
    answer: Exclude<VoidCreditNoteStanding, { kind: "in_progress" }>,
    answeredAt: Date,
  ): Promise<void>;
}

export interface CloudCreditNoteCall {
  creditNoteId: string;
  pointOfSale: number;
  saleEvent: PushedEvent;
}

export interface CloudCreditNotes {
  /**
   * Resolves to already_credited when the cloud refuses because a credit note already corrects the
   * invoice. Resolves to null when the cloud gave no answer. Asking again about the same credit note never
   * issues another one.
   */
  request(call: CloudCreditNoteCall): Promise<VoidCreditNoteStanding | null>;
}

export interface RequestVoidCreditNotesPorts {
  creditNotes: RegisterVoidCreditNotes;
  cloud: CloudCreditNotes;
  clock: Clock;
}
