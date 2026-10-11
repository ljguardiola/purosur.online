import type { PendingRefundsBody } from "@purosur/contracts";
import { refundDayAndTime } from "./refund-moments";
import { refundOriginLabel } from "./refund-origin-label";

type Refund = PendingRefundsBody["refunds"][number];
type CoveringMethod = Refund["covered_by"][number];

const COVERING_METHOD_WORDS = {
  CASH: "en efectivo",
  TRANSFER: "con transferencia",
  QR: "con QR de Mercado Pago",
} satisfies Record<CoveringMethod, string>;

function coveringWords(methods: readonly CoveringMethod[]): string {
  return methods.length === 0
    ? "por otro medio"
    : methods.map((method) => COVERING_METHOD_WORDS[method]).join(" y ");
}

function reasonDetail(
  refund: Pick<
    Refund,
    "origin" | "sale_occurred_at" | "covered_by" | "cancelled_by" | "cancelled_by_name"
  >,
): string {
  const saleMoment = refundDayAndTime(refund.sale_occurred_at);
  if (refund.origin === "late_payment") {
    return `El QR de la venta del ${saleMoment} se pagó después de cobrarla ${coveringWords(refund.covered_by)}`;
  }
  const cancelled = `La venta del ${saleMoment} se canceló`;
  return refund.cancelled_by === null || refund.cancelled_by_name === null
    ? cancelled
    : `${cancelled} · la canceló ${refund.cancelled_by_name}`;
}

export function refundReason(
  refund: Pick<
    Refund,
    "origin" | "sale_occurred_at" | "covered_by" | "cancelled_by" | "cancelled_by_name"
  >,
): { title: string; detail: string } {
  return { title: refundOriginLabel(refund.origin), detail: reasonDetail(refund) };
}
