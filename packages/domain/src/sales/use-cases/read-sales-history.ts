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

export interface ReadSalesHistoryInput {
  session: "open" | "all";
  standing: SaleStanding | undefined;
  page: number;
  document?: SaleDocumentNumber;
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
  { session, standing, page, document }: ReadSalesHistoryInput,
): SalesHistoryPageShown {
  const offset = (page - 1) * SALES_HISTORY_PAGE_SIZE;
  const found =
    document === undefined
      ? pageOfSales(history, session, { standing, offset, limit: SALES_HISTORY_PAGE_SIZE })
      : pageOfSalesWithDocument(history, session, document, { standing, offset });
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
  { standing, offset }: Pick<SalesHistoryFilter, "standing" | "offset">,
): SalesHistoryPage {
  const candidates =
    session === "open"
      ? history.salesOfOpenSessionWithDocument(document)
      : history.salesOfRegisterWithDocument(document);
  const matching = candidates.filter(
    ({ fiscal, voided }) =>
      saleHasDocumentNumber(fiscal, document) &&
      (standing === undefined || saleStandingOf({ ...fiscal, voided }) === standing),
  );
  return {
    entries: matching.slice(offset, offset + SALES_HISTORY_PAGE_SIZE),
    total: matching.length,
  };
}
