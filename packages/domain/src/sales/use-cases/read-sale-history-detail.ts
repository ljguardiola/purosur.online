import { type PlannedRefundState, plannedRefundState } from "../../payments/index.js";
import type { ReceiptCopy } from "../model/receipt-copy.js";
import {
  type ReceiptPrintAvailability,
  receiptPrintAvailability,
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
      }[];
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
  reprint: ReceiptPrintAvailability;
  nextCopy: ReceiptCopy;
}

export type ReadSaleHistoryDetailOutcome =
  | { kind: "not_found" }
  | { kind: "found"; detail: SaleHistoryDetail };

export function readSaleHistoryDetail(
  { history, ledger }: ReadSaleHistoryDetailPorts,
  { saleId }: ReadSaleHistoryDetailInput,
): ReadSaleHistoryDetailOutcome {
  const record = history.saleOfRegister(saleId);
  const delivery = receiptDeliveryOf({ ledger }, { saleId });
  if (record === undefined || delivery.kind === "not_found") {
    return { kind: "not_found" };
  }
  const { fiscal, voided, inOpenSession, ...shown } = record;
  return {
    kind: "found",
    detail: {
      ...shown,
      comprobante: saleComprobanteOf(fiscal),
      standing: saleStandingOf({ ...fiscal, voided }),
      voidability: saleVoidabilityOf(record),
      reprint: receiptPrintAvailability({ voided }),
      nextCopy: delivery.nextCopy,
    },
  };
}

function saleVoidabilityOf({
  voided,
  inOpenSession,
  fiscal,
  payments,
}: SaleHistoryRecord): SaleVoidability {
  const refusal = saleVoidRefusal({
    state: voided ? "VOIDED" : "COMPLETED",
    inOpenSession,
    fiscalDocumentStates: fiscal.fiscalDocument === null ? [] : [fiscal.fiscalDocument.state],
    approvedPaymentMethods: payments.map(({ method }) => method),
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
    })),
  };
}
