import {
  SALES_HISTORY_PAGE_SIZE,
  type SaleComprobante,
  type SaleStanding,
  saleComprobanteOf,
  saleStandingOf,
} from "../model/sale-history.js";
import type { RegisterSalesHistory, SalesHistoryEntry } from "./register-sales-history.js";

export interface ReadSalesHistoryPorts {
  history: RegisterSalesHistory;
}

export interface ReadSalesHistoryInput {
  session: "open" | "all";
  standing: SaleStanding | undefined;
  page: number;
}

export interface SalesHistoryRow {
  saleId: string;
  occurredAt: Date;
  comprobante: SaleComprobante;
  operationNumber: number | null;
  paymentMethods: SalesHistoryEntry["paymentMethods"];
  total: number;
  standing: SaleStanding;
}

export interface SalesHistoryPageShown {
  rows: SalesHistoryRow[];
  total: number;
  pageSize: number;
}

export function readSalesHistory(
  { history }: ReadSalesHistoryPorts,
  { session, standing, page }: ReadSalesHistoryInput,
): SalesHistoryPageShown {
  const filter = {
    standing,
    offset: (page - 1) * SALES_HISTORY_PAGE_SIZE,
    limit: SALES_HISTORY_PAGE_SIZE,
  };
  const found =
    session === "open" ? history.salesOfOpenSession(filter) : history.salesOfRegister(filter);
  return {
    rows: found.entries.map(
      ({ fiscal, ...entry }): SalesHistoryRow => ({
        ...entry,
        comprobante: saleComprobanteOf(fiscal),
        standing: saleStandingOf(fiscal),
      }),
    ),
    total: found.total,
    pageSize: SALES_HISTORY_PAGE_SIZE,
  };
}
