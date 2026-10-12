import {
  mercadoPagoOrderChargeRemainingSeconds,
  mercadoPagoOrderChargeWaitEndsAt,
} from "../model/mercado-pago-order-charge-wait.js";
import type { MercadoPagoChargePorts } from "./mercado-pago-charge-ports.js";

export interface StartMercadoPagoChargeInput {
  actorId: string;
  saleId: string;
  amount: number;
}

export type StartMercadoPagoChargeOutcome<Refusal> =
  | {
      kind: "order_shown";
      paymentTransactionId: string;
      amount: number;
      remainingSeconds: number;
    }
  | { kind: "order_refused" }
  | { kind: "unreachable" }
  | Refusal;

export async function startMercadoPagoCharge<Refusal, Settlement>(
  {
    sale,
    orders,
    charges,
    clock,
  }: Pick<MercadoPagoChargePorts<Refusal, Settlement>, "sale" | "orders" | "charges" | "clock">,
  { actorId, saleId, amount }: StartMercadoPagoChargeInput,
): Promise<StartMercadoPagoChargeOutcome<Refusal>> {
  const startedAt = clock.now();
  const waitEndsAt = mercadoPagoOrderChargeWaitEndsAt(startedAt);
  const recorded = sale.recordPendingPayment({
    actorId,
    saleId,
    amount,
    occurredAt: startedAt,
    waitEndsAt,
  });
  if (recorded.kind === "refused") {
    return recorded.refusal;
  }

  const { paymentTransactionId } = recorded;
  const answer = await orders.requestOrder({ paymentTransactionId, saleId, amount });
  if (answer.kind !== "created") {
    charges.recordWaitEnd(paymentTransactionId, clock.now());
    return answer.kind === "refused" ? { kind: "order_refused" } : { kind: "unreachable" };
  }

  charges.recordWaitEnd(paymentTransactionId, answer.expiresAt);
  return {
    kind: "order_shown",
    paymentTransactionId,
    amount,
    remainingSeconds: mercadoPagoOrderChargeRemainingSeconds(answer.expiresAt, clock.now()),
  };
}
