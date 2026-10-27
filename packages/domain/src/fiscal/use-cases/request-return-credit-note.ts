import type { InvoiceDeferredSalesUpToOutcome } from "./invoice-deferred-sales-up-to.js";
import type { RequestSaleCreditNotePorts } from "./request-credit-notes-ports.js";
import {
  type RequestSaleCreditNoteOutcome,
  requestSaleCreditNote,
} from "./request-sale-credit-note.js";

export interface ReturnedSaleInvoicing {
  invoiceUpTo(saleId: string): Promise<InvoiceDeferredSalesUpToOutcome>;
}

export interface RequestReturnCreditNotePorts extends RequestSaleCreditNotePorts {
  invoicing: ReturnedSaleInvoicing;
}

export interface ReturnCreditNoteToRequest {
  kind: "pending" | "awaiting_invoice" | "issued_offline";
  creditNoteId: string;
}

export interface RequestReturnCreditNoteInput {
  saleId: string;
  creditNote: ReturnCreditNoteToRequest;
}

export interface RequestReturnCreditNoteOutcome {
  invoicing:
    | { kind: "not_awaited" }
    | InvoiceDeferredSalesUpToOutcome
    | { kind: "failed"; error: unknown };
  creditNote: RequestSaleCreditNoteOutcome;
}

async function catchUpInvoice(
  invoicing: ReturnedSaleInvoicing,
  saleId: string,
  creditNote: ReturnCreditNoteToRequest,
): Promise<RequestReturnCreditNoteOutcome["invoicing"]> {
  if (creditNote.kind !== "awaiting_invoice") {
    return { kind: "not_awaited" };
  }
  try {
    return await invoicing.invoiceUpTo(saleId);
  } catch (error) {
    return { kind: "failed", error };
  }
}

export async function requestReturnCreditNote(
  { invoicing, ...ports }: RequestReturnCreditNotePorts,
  { saleId, creditNote }: RequestReturnCreditNoteInput,
): Promise<RequestReturnCreditNoteOutcome> {
  const caughtUp = await catchUpInvoice(invoicing, saleId, creditNote);
  return {
    invoicing: caughtUp,
    creditNote: await requestSaleCreditNote(ports, {
      creditNoteId: creditNote.creditNoteId,
      saleId,
    }),
  };
}
