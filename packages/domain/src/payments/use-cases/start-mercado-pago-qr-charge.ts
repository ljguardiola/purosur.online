import {
  mercadoPagoQrChargeWait,
  mercadoPagoQrChargeWaitEndsAt,
} from "../model/mercado-pago-qr-charge-wait.js";
import type { MercadoPagoQrChargePorts } from "./mercado-pago-qr-charge-ports.js";

export interface StartMercadoPagoQrChargeInput {
  actorId: string;
  saleId: string;
  amount: number;
}

export type StartMercadoPagoQrChargeOutcome<Refusal> =
  | { kind: "order_shown"; paymentTransactionId: string; amount: number; remainingSeconds: number }
  | { kind: "order_refused" }
  | { kind: "unreachable" }
  | Refusal;

export async function startMercadoPagoQrCharge<Refusal, Settlement>(
  {
    sale,
    orders,
    clock,
  }: Pick<MercadoPagoQrChargePorts<Refusal, Settlement>, "sale" | "orders" | "clock">,
  { actorId, saleId, amount }: StartMercadoPagoQrChargeInput,
): Promise<StartMercadoPagoQrChargeOutcome<Refusal>> {
  const startedAt = clock.now();
  const waitEndsAt = mercadoPagoQrChargeWaitEndsAt(startedAt);
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
  if (answer.kind === "refused") {
    return { kind: "order_refused" };
  }
  if (answer.kind === "unreachable") {
    return { kind: "unreachable" };
  }

  const wait = mercadoPagoQrChargeWait(waitEndsAt, clock.now());
  return {
    kind: "order_shown",
    paymentTransactionId,
    amount,
    remainingSeconds: wait.kind === "waiting" ? wait.remainingSeconds : 0,
  };
}
