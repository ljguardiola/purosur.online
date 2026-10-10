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
}

export interface SalesHistoryPage {
  entries: SalesHistoryEntry[];
  total: number;
}

export interface SaleHistoryRecord {
  saleId: string;
  occurredAt: Date;
  operationNumber: number | null;
  servedByFirstName: string;
  lineCount: number;
  total: number;
  payments: { method: PaymentMethod; amount: number }[];
  fiscal: SaleFiscalFacts;
}

export interface RegisterSalesHistory {
  salesOfOpenSession(filter: SalesHistoryFilter): SalesHistoryPage;
  salesOfRegister(filter: SalesHistoryFilter): SalesHistoryPage;
  saleOfRegister(saleId: string): SaleHistoryRecord | undefined;
}
