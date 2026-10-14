import type { OpenSale } from "@purosur/contracts";
import { formatCents } from "@purosur/ui";

export type Refund = OpenSale["refunds_on_cancel"][number];

const GIVEN_BACK_BY: Record<Refund["method"], string> = {
  CASH: "en efectivo",
  TRANSFER: "por transferencia",
  QR: "por QR de Mercado Pago",
  POINT: "por la terminal de Mercado Pago",
  STANDALONE_TERMINAL: "por la terminal independiente",
};

const PENDING_OF: Record<Refund["method"], string> = {
  CASH: "del pago en efectivo",
  TRANSFER: "de la transferencia",
  QR: "del pago con QR",
  POINT: "del pago con la terminal",
  STANDALONE_TERMINAL: "del pago con la terminal independiente",
};

function refundLine(refund: Refund): string {
  const amount = formatCents(refund.amount);
  return refund.state === "PENDING"
    ? `Reembolso pendiente ${PENDING_OF[refund.method]} por ${amount}`
    : `Devolver ${amount} ${GIVEN_BACK_BY[refund.method]}`;
}

const STANDALONE_TERMINAL_REFUND_EXPLANATION =
  "Lo devuelve una persona desde la terminal independiente o la app de Mercado Pago, nunca en efectivo.";

const QR_REFUND_EXPLANATION =
  "La nube lo envía a Mercado Pago cuando alguien lo confirma en el backoffice.";

const BACKOFFICE_REFUND_NOTE =
  "Un reembolso pendiente no se hace desde la caja: se atiende en el backoffice.";

function pendingRefundExplanation(refund: Refund): string | null {
  if (refund.state !== "PENDING") {
    return null;
  }
  switch (refund.method) {
    case "STANDALONE_TERMINAL":
      return STANDALONE_TERMINAL_REFUND_EXPLANATION;
    case "QR":
      return QR_REFUND_EXPLANATION;
    default:
      return null;
  }
}

function needsBackofficeNote(refunds: readonly Refund[]): boolean {
  return refunds.some((refund) => refund.state === "PENDING" && refund.method !== "QR");
}

export function RefundLines({ refunds }: { refunds: readonly Refund[] }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2 text-body text-text">
        {refunds.map((refund) => {
          const explanation = pendingRefundExplanation(refund);
          return (
            <li key={refund.payment_id}>
              <span>{refundLine(refund)}</span>
              {explanation === null ? null : (
                <p className="text-detail text-text-subtle">{explanation}</p>
              )}
            </li>
          );
        })}
      </ul>
      {needsBackofficeNote(refunds) ? (
        <p className="text-detail text-text-subtle">{BACKOFFICE_REFUND_NOTE}</p>
      ) : null}
    </div>
  );
}
