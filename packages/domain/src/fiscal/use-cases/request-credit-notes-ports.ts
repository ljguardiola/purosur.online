import type { Clock } from "../../shared/index.js";
import type { PushedEvent } from "../../sync/index.js";
import type {
  CorrectedInvoice,
  CreditNoteToIssue,
  RequestedCreditNoteAnswer,
  VoidCreditNoteStanding,
} from "../model/sale-credit-note.js";
import type { SaleInvoiceStanding } from "../model/sale-credit-note-route.js";

export type PendingCreditNote = CreditNoteToIssue & { saleEvent: PushedEvent };

export interface RegisterCreditNotes {
  inProgress(): Promise<PendingCreditNote[]>;
  pendingCreditNote(creditNoteId: string): Promise<PendingCreditNote | null>;
  recordedAnswer(creditNoteId: string): Promise<VoidCreditNoteStanding | null>;
  realTimePointOfSale(): Promise<number | null>;
  saleInvoiceStanding(saleId: string): Promise<SaleInvoiceStanding>;
  /**
   * Makes a credit note that waited for its invoice correct that invoice.
   */
  tieToInvoice(creditNoteId: string, invoice: CorrectedInvoice): Promise<void>;
  /**
   * Records the answer of a credit note still in progress; one that already has an answer keeps it.
   */
  recordAnswer(
    creditNoteId: string,
    answer: RequestedCreditNoteAnswer,
    answeredAt: Date,
  ): Promise<void>;
}

export interface CloudCreditNoteCall {
  creditNoteId: string;
  pointOfSale: number;
  saleEvent: PushedEvent;
  invoice?: CorrectedInvoice;
}

export type CloudCreditNoteAnswer = Exclude<VoidCreditNoteStanding, { kind: "issued_offline" }>;

export interface CloudCreditNotes {
  /**
   * Resolves to already_credited when the cloud refuses because a credit note already corrects the
   * invoice. Resolves to null when the cloud gave no answer. Asking again about the same credit note never
   * issues another one.
   */
  request(call: CloudCreditNoteCall): Promise<CloudCreditNoteAnswer | null>;
}

export interface RequestPendingCreditNotesPorts {
  creditNotes: RegisterCreditNotes;
  cloud: CloudCreditNotes;
  clock: Clock;
}

export interface CreditNotePrinter {
  startPrinting(saleId: string): void;
}

export interface RequestSaleCreditNotePorts extends RequestPendingCreditNotesPorts {
  printer: CreditNotePrinter;
}
