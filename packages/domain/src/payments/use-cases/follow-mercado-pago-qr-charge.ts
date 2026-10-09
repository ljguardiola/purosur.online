import { mercadoPagoQrChargeWait } from "../model/mercado-pago-qr-charge-wait.js";
import type { MercadoPagoQrChargePorts } from "./mercado-pago-qr-charge-ports.js";

export interface FollowMercadoPagoQrChargeInput {
  actorId: string;
  paymentTransactionId: string;
}

export type FollowMercadoPagoQrChargeOutcome<Settlement> =
  | { kind: "not_pending" }
  | { kind: "waiting"; remainingSeconds: number }
  | { kind: "wait_over" }
  | { kind: "declined" }
  | { kind: "approved"; settlement: Settlement };

export async function followMercadoPagoQrCharge<Refusal, Settlement>(
  { sale, orders, charges, clock }: MercadoPagoQrChargePorts<Refusal, Settlement>,
  { actorId, paymentTransactionId }: FollowMercadoPagoQrChargeInput,
): Promise<FollowMercadoPagoQrChargeOutcome<Settlement>> {
  const charge = charges.pendingCharge(paymentTransactionId);
  if (charge === null) {
    return { kind: "not_pending" };
  }

  const reading = await orders.readOrder(paymentTransactionId);
  if (reading.kind === "read") {
    const { state } = reading;
    if (state === "APPROVED") {
      return {
        kind: "approved",
        settlement: sale.settleApprovedPayment({ actorId, paymentTransactionId }),
      };
    }
    if (state !== "PENDING") {
      charges.recordEnded(paymentTransactionId, state);
      return { kind: "declined" };
    }
  }

  const wait = mercadoPagoQrChargeWait(charge.waitEndsAt, clock.now());
  return wait.kind === "over"
    ? { kind: "wait_over" }
    : { kind: "waiting", remainingSeconds: wait.remainingSeconds };
}
