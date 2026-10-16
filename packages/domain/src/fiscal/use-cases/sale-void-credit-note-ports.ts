import type { VoucherReference } from "../model/orphan-authorization.js";
import type { CreditNote } from "./credit-note-ports.js";

export class VoucherAlreadyCredited extends Error {}

export interface RecordedCreditNote {
  registerId: string;
  creditNote: CreditNote;
}

export interface SaleVoidCreditNoteRecord {
  creditNoteId: string;
  registerId: string;
  saleId: string;
  pointOfSale: number;
  correctedVoucher: VoucherReference;
  total: number;
  receiverTaxStatusCode: number;
  receivedAt: Date;
}

export interface SaleVoidCreditNoteLane {
  registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  registerIssuesFromPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  recordedCreditNote(creditNoteId: string): Promise<RecordedCreditNote | null>;
  /**
   * Raises VoucherAlreadyCredited when a credit note, of any reason, already corrects the voucher.
   */
  recordSaleVoidCreditNote(record: SaleVoidCreditNoteRecord): Promise<void>;
}

export interface SaleVoidCreditNoteLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: SaleVoidCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RequestSaleVoidCreditNotePorts {
  lanes: SaleVoidCreditNoteLanes;
}
