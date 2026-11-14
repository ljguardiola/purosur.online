import type { DeferredSaleFacts } from "../model/deferred-sale-lookup.js";
import type { SaleHistoryLine } from "./register-sales-history.js";

export interface DeferredSaleLine extends SaleHistoryLine {
  listUnitPrice: number;
}

export type DeferredSaleSearch =
  | { kind: "short_code"; shortCode: string }
  | { kind: "reference"; id: string; shortCode: string }
  | { kind: "sale"; saleId: string };

export interface DeferredSaleLookup {
  find(search: DeferredSaleSearch): DeferredSaleFacts | null;
  linesOf(saleId: string): DeferredSaleLine[];
}

export type DeferredSaleInvoicingOutcome =
  | { kind: "invoiced" }
  | { kind: "not_pending" }
  | { kind: "not_yet"; cause: "cannot_authorize" | "older_sale_blocking" | "not_authorized" };

export interface DeferredSaleInvoicing {
  invoiceUpTo(saleId: string): Promise<DeferredSaleInvoicingOutcome>;
}
