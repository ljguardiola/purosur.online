import type { OpenSale } from "@purosur/contracts";
import { formatCents } from "@purosur/ui";

export type Refund = OpenSale["refunds_on_cancel"][number];

const GIVEN_BACK_BY: Record<Refund["method"], string> = {
  CASH: "en efectivo",
  TRANSFER: "por transferencia",
};

const PENDING_OF: Record<Refund["method"], string> = {
  CASH: "del pago en efectivo",
  TRANSFER: "de la transferencia",
};

function refundLine(refund: Refund): string {
  const amount = formatCents(refund.amount);
  return refund.state === "PENDING"
    ? `Reembolso pendiente ${PENDING_OF[refund.method]} por ${amount}`
    : `Devolver ${amount} ${GIVEN_BACK_BY[refund.method]}`;
}

export function RefundLines({ refunds }: { refunds: readonly Refund[] }) {
  return (
    <ul className="flex flex-col gap-2 text-body text-text">
      {refunds.map((refund) => (
        <li key={refund.payment_id}>{refundLine(refund)}</li>
      ))}
    </ul>
  );
}
