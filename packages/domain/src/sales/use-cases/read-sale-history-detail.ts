import {
  invoiceToCorrect,
  type VoidCreditNoteStanding,
  type VoucherReference,
} from "../../fiscal/index.js";
import {
  isRefundSentByCloud,
  type PlannedRefundState,
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
import type { RegisterSalesHistory, SaleHistoryRecord } from "./register-sales-history.js";

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
        amount: number;
        state: PlannedRefundState;
        sentByCloud: boolean;
      }[];
      creditNoteCorrects: VoucherReference | null;
    }
  | { kind: "not_voidable"; refusal: SaleVoidRefusal };

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
  creditNote: VoidCreditNoteStanding | null;
  reprint: SaleReceiptAvailability;
  nextCopy: ReceiptCopy;
  creditNoteNextCopy: ReceiptCopy | null;
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
  const { fiscal, voided, inOpenSession, invoices: _invoices, ...shown } = record;
  const creditNoteDelivery =
    record.creditNote?.kind === "authorized" || record.creditNote?.kind === "issued_offline"
      ? receiptDeliveryOf({ ledger }, { document: "credit_note", saleId })
      : undefined;
  return {
    kind: "found",
    detail: {
      ...shown,
      comprobante: saleComprobanteOf(fiscal),
      standing: saleStandingOf({ ...fiscal, voided }),
      voidability: saleVoidabilityOf(record),
      reprint: receiptPrintAvailability("sale_receipt", { voided }),
      nextCopy: delivery.nextCopy,
      creditNoteNextCopy: creditNoteDelivery?.kind === "found" ? creditNoteDelivery.nextCopy : null,
    },
  };
}

function saleVoidabilityOf({
  voided,
  inOpenSession,
  invoices,
  payments,
}: SaleHistoryRecord): SaleVoidability {
  const refusal = saleVoidRefusal({
    state: voided ? "VOIDED" : "COMPLETED",
    inOpenSession,
    fiscalDocumentStates: invoices.map(({ state }) => state),
  });
  if (refusal !== null) {
    return { kind: "not_voidable", refusal };
  }
  return {
    kind: "voidable",
    refunds: payments.map(({ method, amount }) => ({
      method,
      amount,
      state: plannedRefundState(method),
      sentByCloud: isRefundSentByCloud({ method, origin: SALE_VOIDED_REFUND_ORIGIN }),
    })),
    creditNoteCorrects: invoiceToCorrect(invoices)?.voucher ?? null,
  };
}
