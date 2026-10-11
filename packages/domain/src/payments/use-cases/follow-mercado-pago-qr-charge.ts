import {
  mercadoPagoQrChargeRemainingSeconds,
  mercadoPagoQrChargeWait,
} from "../model/mercado-pago-qr-charge-wait.js";
import type { MercadoPagoQrChargePorts } from "./mercado-pago-qr-charge-ports.js";

export interface FollowMercadoPagoQrChargeInput {
  actorId: string;
  paymentTransactionId: string;
}

export type FollowMercadoPagoQrChargeOutcome<Settlement> =
  | { kind: "not_pending" }
  | { kind: "waiting"; remainingSeconds: number }
  | { kind: "wait_over" }
  | { kind: "expiry_unconfirmed" }
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
    if (state === "EXPIRED") {
      charges.recordEnded(paymentTransactionId, state);
      return { kind: "wait_over" };
    }
    if (state !== "PENDING") {
      charges.recordEnded(paymentTransactionId, state);
      return { kind: "declined" };
    }
  }

  const now = clock.now();
  if (
    reading.kind === "unreachable" &&
    mercadoPagoQrChargeWait(charge.waitEndsAt, now).kind === "over"
  ) {
    return { kind: "expiry_unconfirmed" };
  }
  return {
    kind: "waiting",
    remainingSeconds: mercadoPagoQrChargeRemainingSeconds(charge.waitEndsAt, now),
  };
}
