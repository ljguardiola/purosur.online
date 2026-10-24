import type { DeferredSaleFacts } from "../model/deferred-sale-lookup.js";

export type DeferredSaleSearch =
  | { kind: "short_code"; shortCode: string }
  | { kind: "reference"; id: string; shortCode: string }
  | { kind: "sale"; saleId: string };

export interface DeferredSaleLookup {
  find(search: DeferredSaleSearch): DeferredSaleFacts | null;
}

export type DeferredSaleInvoicingOutcome =
  | { kind: "invoiced" }
  | { kind: "not_pending" }
  | { kind: "not_yet"; cause: "cannot_authorize" | "older_sale_blocking" | "not_authorized" };

export interface DeferredSaleInvoicing {
  invoiceUpTo(saleId: string): Promise<DeferredSaleInvoicingOutcome>;
}
