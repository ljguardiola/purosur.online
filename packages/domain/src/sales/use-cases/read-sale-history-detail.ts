import { invoiceToCorrect, type VoucherReference } from "../../fiscal/index.js";
import {
  isRefundSentByCloud,
  type PlannedRefundState,
  type PointCardType,
  plannedRefundState,
  SALE_VOIDED_REFUND_ORIGIN,
} from "../../payments/index.js";
import type { ReceiptCopy } from "../model/receipt-copy.js";
import {
  receiptPrintAvailability,
  type SaleReceiptAvailability,
} from "../model/receipt-print-availability.js";
import {
  type SaleComprobante,
  type SaleStanding,
  saleComprobanteOf,
  saleStandingOf,
} from "../model/sale-history.js";
import { type SaleVoidRefusal, saleVoidRefusal } from "../model/sale-void.js";
import { receiptDeliveryOf } from "./receipt-delivery-of.js";
import type { ReceiptLedger } from "./receipt-ports.js";
import type {
  RegisterSalesHistory,
  SaleHistoryCreditNote,
  SaleHistoryRecord,
} from "./register-sales-history.js";

export interface ReadSaleHistoryDetailPorts {
  history: RegisterSalesHistory;
  ledger: ReceiptLedger;
}

export interface ReadSaleHistoryDetailInput {
  saleId: string;
}

export type SaleVoidability =
  | {
      kind: "voidable";
      refunds: {
        method: SaleHistoryRecord["payments"][number]["method"];
        cardType: PointCardType | null;
        amount: number;
        state: PlannedRefundState;
        sentByCloud: boolean;
      }[];
      creditNoteCorrects: VoucherReference | null;
    }
  | { kind: "not_voidable"; refusal: SaleVoidRefusal };

interface SaleHistoryDetailCreditNote extends SaleHistoryCreditNote {
  nextCopy: ReceiptCopy | null;
}

export interface SaleHistoryDetail {
  saleId: string;
  occurredAt: Date;
  total: number;
  comprobante: SaleComprobante;
  operationNumber: number | null;
  servedByFirstName: string;
  lineCount: number;
  payments: SaleHistoryRecord["payments"];
  standing: SaleStanding;
  voidability: SaleVoidability;
  creditNotes: SaleHistoryDetailCreditNote[];
  reprint: SaleReceiptAvailability;
  nextCopy: ReceiptCopy;
  deferredInvoiceNextCopy: ReceiptCopy | null;
  shortCode: string | null;
}

export type ReadSaleHistoryDetailOutcome =
  | { kind: "not_found" }
  | { kind: "found"; detail: SaleHistoryDetail };

export function readSaleHistoryDetail(
  { history, ledger }: ReadSaleHistoryDetailPorts,
  { saleId }: ReadSaleHistoryDetailInput,
): ReadSaleHistoryDetailOutcome {
  const record = history.saleOfRegister(saleId);
  const delivery = receiptDeliveryOf({ ledger }, { document: "sale_receipt", saleId });
  if (record === undefined || delivery.kind === "not_found") {
    return { kind: "not_found" };
  }
  const {
    fiscal,
    voided,
    inOpenSession,
    hasReturn: _hasReturn,
    invoices: _invoices,
    deferredInvoiceIssued,
    deferredShortCode,
    creditNotes,
    ...shown
  } = record;
  const deferredInvoiceDelivery = deferredInvoiceIssued
    ? receiptDeliveryOf({ ledger }, { document: "deferred_invoice", saleId })
    : undefined;
  return {
    kind: "found",
    detail: {
      ...shown,
      creditNotes: creditNotes.map((creditNote) => ({
        ...creditNote,
        nextCopy: nextCopyOfCreditNote(ledger, saleId, creditNote),
      })),
      comprobante: saleComprobanteOf(fiscal),
      standing: saleStandingOf({ ...fiscal, voided }),
      voidability: saleVoidabilityOf(record),
      reprint: receiptPrintAvailability("sale_receipt", { voided }),
      nextCopy: delivery.nextCopy,
      deferredInvoiceNextCopy:
        deferredInvoiceDelivery?.kind === "found" ? deferredInvoiceDelivery.nextCopy : null,
      shortCode: deferredShortCode,
    },
  };
}

function nextCopyOfCreditNote(
  ledger: ReceiptLedger,
  saleId: string,
  { creditNoteId, standing }: SaleHistoryCreditNote,
): ReceiptCopy | null {
  if (standing.kind !== "authorized" && standing.kind !== "issued_offline") {
    return null;
  }
  const delivery = receiptDeliveryOf({ ledger }, { document: "credit_note", saleId, creditNoteId });
  return delivery.kind === "found" ? delivery.nextCopy : null;
}

function saleVoidabilityOf({
  voided,
  inOpenSession,
  hasReturn,
  invoices,
  payments,
}: SaleHistoryRecord): SaleVoidability {
  const refusal = saleVoidRefusal({
    state: voided ? "VOIDED" : "COMPLETED",
    inOpenSession,
    hasReturn,
    fiscalDocumentStates: invoices.map(({ state }) => state),
  });
  if (refusal !== null) {
    return { kind: "not_voidable", refusal };
  }
  return {
    kind: "voidable",
    refunds: payments.map(({ method, amount, cardType }) => ({
      method,
      cardType,
      amount,
      state: plannedRefundState(method),
      sentByCloud: isRefundSentByCloud({ method, origin: SALE_VOIDED_REFUND_ORIGIN }),
    })),
    creditNoteCorrects: invoiceToCorrect(invoices)?.voucher ?? null,
  };
}
