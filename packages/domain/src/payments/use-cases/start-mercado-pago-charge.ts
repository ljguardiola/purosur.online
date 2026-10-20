import {
  mercadoPagoOrderChargeRemainingSeconds,
  mercadoPagoOrderChargeWaitEndsAt,
  mercadoPagoOrderChargeWaitSeconds,
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
      kind: "order_shown" | "order_unconfirmed";
      paymentTransactionId: string;
      amount: number;
      remainingSeconds: number;
      waitSeconds: number;
    }
  | { kind: "order_refused" }
  | { kind: "not_configured" }
  | { kind: "below_minimum" }
  | { kind: "unreachable" }
  | Refusal;

function startedOnTheTerminal<Refusal>(
  { charges, clock }: Pick<MercadoPagoChargePorts<Refusal, unknown>, "charges" | "clock">,
  order: { paymentTransactionId: string; amount: number; startedAt: Date; waitEndsAt: Date },
  answer: MercadoPagoChargeOrderAnswer,
): StartMercadoPagoChargeOutcome<Refusal> {
  if (
    answer.kind === "refused" ||
    answer.kind === "not_configured" ||
    answer.kind === "below_minimum"
  ) {
    charges.recordEnded(order.paymentTransactionId, "CANCELLED");
    return answer.kind === "refused" ? { kind: "order_refused" } : { kind: answer.kind };
  }
  return {
    kind: answer.kind === "unreachable" ? "order_unconfirmed" : "order_shown",
    paymentTransactionId: order.paymentTransactionId,
    amount: order.amount,
    remainingSeconds: mercadoPagoOrderChargeRemainingSeconds(order.waitEndsAt, clock.now()),
    waitSeconds: mercadoPagoOrderChargeWaitSeconds(order.startedAt, order.waitEndsAt),
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
      { paymentTransactionId, amount, startedAt, waitEndsAt },
      answer,
    );
  }
  if (answer.kind === "not_configured") {
    charges.recordEnded(paymentTransactionId, "CANCELLED");
    return { kind: "not_configured" };
  }
  if (answer.kind !== "created") {
    charges.recordWaitEnd(paymentTransactionId, clock.now());
    return answer.kind === "unreachable" ? { kind: "unreachable" } : { kind: "order_refused" };
  }

  charges.recordWaitEnd(paymentTransactionId, answer.expiresAt);
  return {
    kind: "order_shown",
    paymentTransactionId,
    amount,
    remainingSeconds: mercadoPagoOrderChargeRemainingSeconds(answer.expiresAt, clock.now()),
    waitSeconds: mercadoPagoOrderChargeWaitSeconds(startedAt, answer.expiresAt),
  };
}
