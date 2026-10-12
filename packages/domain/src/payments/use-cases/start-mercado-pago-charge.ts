import {
  mercadoPagoOrderChargeRemainingSeconds,
  mercadoPagoOrderChargeWaitEndsAt,
} from "../model/mercado-pago-order-charge-wait.js";
import type {
  MercadoPagoChargeOrderAnswer,
  MercadoPagoChargePorts,
  PendingMercadoPagoPayment,
} from "./mercado-pago-charge-ports.js";

export interface StartMercadoPagoChargeInput {
  actorId: string;
  saleId: string;
  method: PendingMercadoPagoPayment["method"];
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

function startedOnTheTerminal<Refusal>(
  { charges, clock }: Pick<MercadoPagoChargePorts<Refusal, unknown>, "charges" | "clock">,
  order: { paymentTransactionId: string; amount: number; waitEndsAt: Date },
  answer: MercadoPagoChargeOrderAnswer,
): StartMercadoPagoChargeOutcome<Refusal> {
  if (answer.kind === "refused") {
    charges.recordEnded(order.paymentTransactionId, "CANCELLED");
    return { kind: "order_refused" };
  }
  if (answer.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  return {
    kind: "order_shown",
    paymentTransactionId: order.paymentTransactionId,
    amount: order.amount,
    remainingSeconds: mercadoPagoOrderChargeRemainingSeconds(order.waitEndsAt, clock.now()),
  };
}

export async function startMercadoPagoCharge<Refusal, Settlement>(
  {
    sale,
    orders,
    charges,
    clock,
  }: Pick<MercadoPagoChargePorts<Refusal, Settlement>, "sale" | "orders" | "charges" | "clock">,
  { actorId, saleId, method, amount }: StartMercadoPagoChargeInput,
): Promise<StartMercadoPagoChargeOutcome<Refusal>> {
  const startedAt = clock.now();
  const waitEndsAt = mercadoPagoOrderChargeWaitEndsAt(startedAt);
  const recorded = sale.recordPendingPayment({
    actorId,
    saleId,
    method,
    amount,
    occurredAt: startedAt,
    waitEndsAt,
  });
  if (recorded.kind === "refused") {
    return recorded.refusal;
  }

  const { paymentTransactionId } = recorded;
  const answer = await orders.requestOrder({ paymentTransactionId, saleId, method, amount });
  if (method === "POINT") {
    return startedOnTheTerminal(
      { charges, clock },
      { paymentTransactionId, amount, waitEndsAt },
      answer,
    );
  }
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
