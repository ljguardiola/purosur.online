import type { MercadoPagoQrChargePorts } from "./mercado-pago-qr-charge-ports.js";

export interface AbandonMercadoPagoQrChargeInput {
  actorId: string;
  paymentTransactionId: string;
}

export type AbandonMercadoPagoQrChargeOutcome<Refusal, Settlement> =
  | { kind: "not_pending" }
  | { kind: "cancelled" }
  | { kind: "already_paid"; settlement: Settlement }
  | { kind: "closed" }
  | { kind: "replaced" }
  | Refusal;

export async function abandonMercadoPagoQrCharge<Refusal, Settlement>(
  { sale, orders, charges, clock }: MercadoPagoQrChargePorts<Refusal, Settlement>,
  { actorId, paymentTransactionId }: AbandonMercadoPagoQrChargeInput,
): Promise<AbandonMercadoPagoQrChargeOutcome<Refusal, Settlement>> {
  if (charges.pendingCharge(paymentTransactionId) === null) {
    return { kind: "not_pending" };
  }

  const cancellation = await orders.cancelOrder(paymentTransactionId);
  if (cancellation.kind === "answered") {
    const { state } = cancellation;
    if (state === "APPROVED") {
      return {
        kind: "already_paid",
        settlement: sale.settleApprovedPayment({ actorId, paymentTransactionId }),
      };
    }
    if (state !== "PENDING") {
      charges.recordEnded(paymentTransactionId, state);
      return { kind: state === "CANCELLED" ? "cancelled" : "closed" };
    }
  }

  const replacement = sale.replacePendingPayment({
    actorId,
    paymentTransactionId,
    replacedAt: clock.now(),
  });
  return replacement.kind === "refused" ? replacement.refusal : replacement;
}
