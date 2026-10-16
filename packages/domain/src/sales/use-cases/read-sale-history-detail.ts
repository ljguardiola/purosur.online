import { type CreditNoteAnswer, isRegisterFiscallyOnline } from "../../fiscal/index.js";
import {
  isRefundSentByCloud,
  type PlannedRefundState,
  plannedRefundState,
  SALE_VOIDED_REFUND_ORIGIN,
} from "../../payments/index.js";
import type { Clock } from "../../shared/index.js";
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
  clock: Clock;
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
  creditNote: CreditNoteAnswer | null;
  reprint: ReceiptPrintAvailability;
  nextCopy: ReceiptCopy;
}

export type ReadSaleHistoryDetailOutcome =
  | { kind: "not_found" }
  | { kind: "found"; detail: SaleHistoryDetail };

export function readSaleHistoryDetail(
  { history, ledger, clock }: ReadSaleHistoryDetailPorts,
  { saleId }: ReadSaleHistoryDetailInput,
): ReadSaleHistoryDetailOutcome {
  const record = history.saleOfRegister(saleId);
  const delivery = receiptDeliveryOf({ ledger }, { saleId });
  if (record === undefined || delivery.kind === "not_found") {
    return { kind: "not_found" };
  }
  const { fiscal, voided, inOpenSession, ...shown } = record;
  const fiscallyOnline = isRegisterFiscallyOnline(history.fiscalOnlineEvidence(), clock.now());
  return {
    kind: "found",
    detail: {
      ...shown,
      comprobante: saleComprobanteOf(fiscal),
      standing: saleStandingOf({ ...fiscal, voided }),
      voidability: saleVoidabilityOf(record, fiscallyOnline),
      reprint: receiptPrintAvailability({ voided }),
      nextCopy: delivery.nextCopy,
    },
  };
}

function saleVoidabilityOf(
  { voided, inOpenSession, fiscal, payments }: SaleHistoryRecord,
  fiscallyOnline: boolean,
): SaleVoidability {
  const refusal = saleVoidRefusal({
    state: voided ? "VOIDED" : "COMPLETED",
    inOpenSession,
    fiscalDocumentStates: fiscal.fiscalDocument === null ? [] : [fiscal.fiscalDocument.state],
    fiscallyOnline,
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
  };
}
