import type { CreditNoteOrigin, SaleInvoice, VoidCreditNoteStanding } from "../../fiscal/index.js";
import type { PointCardType } from "../../payments/index.js";
import type { CompletedSalePayment } from "../model/completed-sale.js";
import type { SaleFiscalFacts, SaleStanding } from "../model/sale-history.js";

type PaymentMethod = CompletedSalePayment["method"];

export interface SalesHistoryFilter {
  standing: SaleStanding | undefined;
  offset: number;
  limit: number;
}

export interface SalesHistoryEntry {
  saleId: string;
  occurredAt: Date;
  operationNumber: number | null;
  paymentMethods: PaymentMethod[];
  total: number;
  fiscal: SaleFiscalFacts;
  voided: boolean;
}

export interface SalesHistoryPage {
  entries: SalesHistoryEntry[];
  total: number;
}

export interface SaleHistoryCreditNote {
  creditNoteId: string;
  origin: CreditNoteOrigin["kind"];
  standing: VoidCreditNoteStanding;
}

export interface SaleHistoryRecord {
  saleId: string;
  occurredAt: Date;
  operationNumber: number | null;
  servedByFirstName: string;
  lineCount: number;
  total: number;
  payments: { method: PaymentMethod; amount: number; cardType: PointCardType | null }[];
  fiscal: SaleFiscalFacts;
  voided: boolean;
  inOpenSession: boolean;
  hasReturn: boolean;
  invoices: SaleInvoice[];
  creditNotes: SaleHistoryCreditNote[];
  deferredInvoiceIssued: boolean;
  deferredShortCode: string | null;
}

export interface RegisterSalesHistory {
  salesOfOpenSession(filter: SalesHistoryFilter): SalesHistoryPage;
  salesOfRegister(filter: SalesHistoryFilter): SalesHistoryPage;
  saleOfRegister(saleId: string): SaleHistoryRecord | undefined;
  fiscalFactsOfSale(saleId: string): SaleFiscalFacts;
}
