import type { PendingRefundsBody } from "@purosur/contracts";

type RefundOrigin = PendingRefundsBody["refunds"][number]["origin"];

const REFUND_ORIGIN_LABELS = {
  sale_cancelled: "Venta cancelada",
  late_payment: "Aprobación tardía",
  sale_voided: "Anulación de venta",
} satisfies Record<RefundOrigin, string>;

export function refundOriginLabel(origin: RefundOrigin): string {
  return REFUND_ORIGIN_LABELS[origin];
}
