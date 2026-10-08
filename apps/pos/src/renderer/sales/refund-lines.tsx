import type { OpenSale } from "@purosur/contracts";
import { formatCents } from "@purosur/ui";

export type Refund = OpenSale["refunds_on_cancel"][number];

function refundLine(refund: Refund): string {
  const amount = formatCents(refund.amount);
  return refund.method === "CASH"
    ? `Devolver ${amount} en efectivo`
    : `Reembolso pendiente de la transferencia por ${amount}`;
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
