import {
  mercadoPagoOrderChargeRemainingSeconds,
  mercadoPagoOrderChargeWait,
} from "../model/mercado-pago-order-charge-wait.js";
import type { MercadoPagoChargePorts } from "./mercado-pago-charge-ports.js";

export interface FollowMercadoPagoChargeInput {
  actorId: string;
  paymentTransactionId: string;
}

export type FollowMercadoPagoChargeOutcome<Settlement> =
  | { kind: "not_pending" }
  | { kind: "waiting"; remainingSeconds: number }
  | { kind: "wait_over" }
  | { kind: "at_terminal_wait_over" }
  | { kind: "closed" }
  | { kind: "expiry_unconfirmed" }
  | { kind: "declined" }
  | { kind: "approved"; settlement: Settlement };

export async function followMercadoPagoCharge<Refusal, Settlement>(
  { sale, orders, charges, clock }: MercadoPagoChargePorts<Refusal, Settlement>,
  { actorId, paymentTransactionId }: FollowMercadoPagoChargeInput,
): Promise<FollowMercadoPagoChargeOutcome<Settlement>> {
  const charge = charges.pendingCharge(paymentTransactionId);
  if (charge === null) {
    return { kind: "not_pending" };
  }

  const reading = await orders.readOrder(paymentTransactionId);
  if (reading.kind === "not_recorded") {
    charges.recordEnded(paymentTransactionId, "CANCELLED");
    return { kind: charge.method === "POINT" ? "closed" : "wait_over" };
  }
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
      return { kind: charge.method === "POINT" ? "closed" : "wait_over" };
    }
    if (state !== "PENDING") {
      charges.recordEnded(paymentTransactionId, state);
      return { kind: charge.method === "POINT" && state === "CANCELLED" ? "closed" : "declined" };
    }
  }

  const now = clock.now();
  if (
    charge.method === "POINT" &&
    mercadoPagoOrderChargeWait(charge.waitEndsAt, now).kind === "over"
  ) {
    return { kind: "at_terminal_wait_over" };
  }
  if (
    reading.kind === "unreachable" &&
    mercadoPagoOrderChargeWait(charge.waitEndsAt, now).kind === "over"
  ) {
    return { kind: "expiry_unconfirmed" };
  }
  return {
    kind: "waiting",
    remainingSeconds: mercadoPagoOrderChargeRemainingSeconds(charge.waitEndsAt, now),
  };
}
