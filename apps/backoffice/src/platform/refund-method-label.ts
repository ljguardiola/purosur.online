import type { PendingRefundsBody } from "@purosur/contracts";

type RefundMethod = PendingRefundsBody["refunds"][number]["method"];

const REFUND_METHOD_LABELS = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR de Mercado Pago",
  POINT: "Point integrada",
  STANDALONE_TERMINAL: "Terminal independiente",
} satisfies Record<RefundMethod, string>;

export function refundMethodLabel(method: RefundMethod): string {
  return REFUND_METHOD_LABELS[method];
}
