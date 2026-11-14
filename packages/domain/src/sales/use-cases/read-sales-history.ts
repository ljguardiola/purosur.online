import type { DeferredSaleReference } from "../../fiscal/index.js";
import {
  SALES_HISTORY_PAGE_SIZE,
  type SaleComprobante,
  type SaleDocumentNumber,
  type SaleStanding,
  saleComprobanteOf,
  saleHasDocumentNumber,
  saleStandingOf,
} from "../model/sale-history.js";
import type {
  RegisterSalesHistory,
  SalesHistoryEntry,
  SalesHistoryFilter,
  SalesHistoryPage,
} from "./register-sales-history.js";

export interface ReadSalesHistoryPorts {
  history: RegisterSalesHistory;
}

export type SalesHistorySearch =
  | ({ kind: "invoice" } & SaleDocumentNumber)
  | ({ kind: "deferred" } & DeferredSaleReference);

export interface ReadSalesHistoryInput {
  session: "open" | "all";
  page: number;
  search?: SalesHistorySearch;
}

export interface SalesHistoryRow {
  saleId: string;
  occurredAt: Date;
  comprobante: SaleComprobante;
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
  { session, page, search }: ReadSalesHistoryInput,
): SalesHistoryPageShown {
  const offset = (page - 1) * SALES_HISTORY_PAGE_SIZE;
  const found = pageFound(history, session, search, offset);
  return {
    rows: found.entries.map(
      ({ fiscal, voided, ...entry }): SalesHistoryRow => ({
        ...entry,
        comprobante: saleComprobanteOf(fiscal),
        standing: saleStandingOf({ ...fiscal, voided }),
      }),
    ),
    total: found.total,
    pageSize: SALES_HISTORY_PAGE_SIZE,
  };
}

function pageFound(
  history: RegisterSalesHistory,
  session: ReadSalesHistoryInput["session"],
  search: SalesHistorySearch | undefined,
  offset: number,
): SalesHistoryPage {
  if (search === undefined) {
    return pageOfSales(history, session, { offset, limit: SALES_HISTORY_PAGE_SIZE });
  }
  if (search.kind === "invoice") {
    const { pointOfSale, number } = search;
    return pageOfSalesWithDocument(history, session, { pointOfSale, number }, offset);
  }
  const { id, shortCode } = search;
  const sales =
    session === "open"
      ? history.salesOfOpenSessionOfDeferredSale({ id, shortCode })
      : history.salesOfRegisterOfDeferredSale({ id, shortCode });
  return { entries: sales.slice(offset, offset + SALES_HISTORY_PAGE_SIZE), total: sales.length };
}

function pageOfSales(
  history: RegisterSalesHistory,
  session: ReadSalesHistoryInput["session"],
  filter: SalesHistoryFilter,
): SalesHistoryPage {
  return session === "open" ? history.salesOfOpenSession(filter) : history.salesOfRegister(filter);
}

function pageOfSalesWithDocument(
  history: RegisterSalesHistory,
  session: ReadSalesHistoryInput["session"],
  document: SaleDocumentNumber,
  offset: number,
): SalesHistoryPage {
  const candidates =
    session === "open"
      ? history.salesOfOpenSessionWithDocument(document)
      : history.salesOfRegisterWithDocument(document);
  const matching = candidates.filter(({ fiscal }) => saleHasDocumentNumber(fiscal, document));
  return {
    entries: matching.slice(offset, offset + SALES_HISTORY_PAGE_SIZE),
    total: matching.length,
  };
}
