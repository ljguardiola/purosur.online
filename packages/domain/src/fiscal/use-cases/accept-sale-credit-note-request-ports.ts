import type { VoucherReference } from "../model/orphan-authorization.js";
import type { AttachedSaleEvents } from "./attached-sale-event-ports.js";
import type { CreditNote } from "./credit-note-ports.js";

export class VoucherAlreadyCredited extends Error {}

export class CreditNoteIdTaken extends Error {}

export interface InvoiceAlreadyCredited {
  voucher: VoucherReference;
  saleId: string;
}

export interface AlreadyCreditedRefusal {
  creditNoteId: string;
  registerId: string;
  saleId: string;
}

export interface SaleCreditNoteRecord {
  creditNoteId: string;
  registerId: string;
  saleId: string;
  pointOfSale: number;
  correctedVoucher: VoucherReference;
  total: number;
  receiverTaxStatusCode: number;
  receivedAt: Date;
}

export interface SaleCreditNoteLane {
  registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  registerIssuesFromPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  recordedCreditNote(registerId: string, creditNoteId: string): Promise<CreditNote | null>;
  /**
   * Raises VoucherAlreadyCredited when a credit note, of any reason, already corrects the voucher,
   * and CreditNoteIdTaken when another register's credit note holds the id.
   */
  recordSaleCreditNote(record: SaleCreditNoteRecord): Promise<void>;
  raiseInvoiceAlreadyCredited(invoice: InvoiceAlreadyCredited, at: Date): Promise<void>;
  keepAlreadyCreditedRefusal(refusal: AlreadyCreditedRefusal, at: Date): Promise<void>;
}

export interface SaleCreditNoteLanes {
  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: SaleCreditNoteLane) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface AcceptSaleCreditNoteRequestPorts {
  lanes: SaleCreditNoteLanes;
  attachedSaleEvents: AttachedSaleEvents;
}
