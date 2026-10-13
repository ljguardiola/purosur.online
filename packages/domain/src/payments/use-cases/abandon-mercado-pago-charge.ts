import type { MercadoPagoChargePorts } from "./mercado-pago-charge-ports.js";

export interface AbandonMercadoPagoChargeInput {
  actorId: string;
  paymentTransactionId: string;
}

export type AbandonMercadoPagoChargeOutcome<ReplacementRefusal, Settlement> =
  | { kind: "not_pending" }
  | { kind: "cancelled" }
  | { kind: "already_paid"; settlement: Settlement }
  | { kind: "closed" }
  | { kind: "cancel_on_terminal" }
  | { kind: "unreachable" }
  | { kind: "replaced" }
  | ReplacementRefusal;

export async function abandonMercadoPagoCharge<Refusal, Settlement, ReplacementRefusal>(
  { sale, orders, charges, clock }: MercadoPagoChargePorts<Refusal, Settlement, ReplacementRefusal>,
  { actorId, paymentTransactionId }: AbandonMercadoPagoChargeInput,
): Promise<AbandonMercadoPagoChargeOutcome<ReplacementRefusal, Settlement>> {
  const charge = charges.pendingCharge(paymentTransactionId);
  if (charge === null) {
    return { kind: "not_pending" };
  }

  const cancellation = await orders.cancelOrder({
    paymentTransactionId,
    saleId: charge.saleId,
    method: charge.method,
    amount: charge.amount,
  });
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

  if (charge.method === "POINT") {
    return cancellation.kind === "cancel_on_terminal"
      ? { kind: "cancel_on_terminal" }
      : { kind: "unreachable" };
  }

  const replacement = sale.replacePendingPayment({
    actorId,
    paymentTransactionId,
    replacedAt: clock.now(),
  });
  return replacement.kind === "refused" ? replacement.refusal : replacement;
}
