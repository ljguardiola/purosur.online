import type { ReceiptCopy } from "../model/receipt-copy.js";
import {
  type SaleComprobante,
  type SaleStanding,
  saleComprobanteOf,
  saleStandingOf,
} from "../model/sale-history.js";
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
  const { fiscal, ...shown } = record;
  return {
    kind: "found",
    detail: {
      ...shown,
      comprobante: saleComprobanteOf(fiscal),
      standing: saleStandingOf(fiscal),
      nextCopy: delivery.nextCopy,
    },
  };
}
