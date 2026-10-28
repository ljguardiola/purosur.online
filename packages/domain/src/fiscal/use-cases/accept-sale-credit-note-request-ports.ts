import type { VoucherReference } from "../model/orphan-authorization.js";
import type { CreditNoteOrigin } from "../model/sale-credit-note.js";
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
  origin: CreditNoteOrigin;
  receivedAt: Date;
}

export interface SaleCreditNoteLane {
  registerOwnsPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  branchIssuesFromPointOfSale(registerId: string, pointOfSale: number): Promise<boolean>;
  recordedCreditNote(registerId: string, creditNoteId: string): Promise<CreditNote | null>;
  /**
   * The total of the invoice the voucher names, or null when the cloud does not hold it.
   */
  invoiceTotalOf(voucher: VoucherReference): Promise<number | null>;
  /**
   * The sum of the credit notes that credit the voucher, those the tax authority rejected or that
   * could not be issued left out.
   */
  creditedToInvoice(voucher: VoucherReference): Promise<number>;
  /**
   * Raises VoucherAlreadyCredited when, racing another request, the credit exceeds the invoice's
   * total, and CreditNoteIdTaken when another register's credit note holds the id.
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
