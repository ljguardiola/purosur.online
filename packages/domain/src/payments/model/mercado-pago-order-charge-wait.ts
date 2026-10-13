import type { MercadoPagoPaymentMethod } from "./payment.js";

export const MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES = 3;

const MERCADO_PAGO_ORDER_CHARGE_WAIT_SECONDS = MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES * 60;

export const MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS = 3_000;

export type MercadoPagoOrderChargeWait =
  | { kind: "waiting"; remainingSeconds: number }
  | { kind: "over" };

export function mercadoPagoOrderChargeWaitEndsAt(chargeStartedAt: Date): Date {
  return new Date(chargeStartedAt.getTime() + MERCADO_PAGO_ORDER_CHARGE_WAIT_SECONDS * 1000);
}

export function mercadoPagoOrderChargeWaitSeconds(chargeStartedAt: Date, waitEndsAt: Date): number {
  return Math.max(0, Math.ceil((waitEndsAt.getTime() - chargeStartedAt.getTime()) / 1000));
}

export function mercadoPagoOrderChargeWait(
  waitEndsAt: Date,
  now: Date,
): MercadoPagoOrderChargeWait {
  const remainingMs = waitEndsAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return { kind: "over" };
  }
  return { kind: "waiting", remainingSeconds: Math.ceil(remainingMs / 1000) };
}

export function mercadoPagoOrderChargeRemainingSeconds(waitEndsAt: Date, now: Date): number {
  const wait = mercadoPagoOrderChargeWait(waitEndsAt, now);
  return wait.kind === "waiting" ? wait.remainingSeconds : 0;
}

export interface MercadoPagoChargeInProgress {
  paymentTransactionId: string;
  method: MercadoPagoPaymentMethod;
  amount: number;
  remainingSeconds: number;
  waitSeconds: number;
}

function inProgress({ method, waitEndsAt }: { method: string; waitEndsAt: Date }, now: Date) {
  return method === "POINT" || mercadoPagoOrderChargeWait(waitEndsAt, now).kind === "waiting";
}

export function aMercadoPagoChargeInProgress(
  pendingPayments: readonly { method: string; waitEndsAt: Date }[],
  now: Date,
): boolean {
  return pendingPayments.some((payment) => inProgress(payment, now));
}

export function mercadoPagoChargeInProgress(
  pendingPayments: readonly {
    id: string;
    method: MercadoPagoPaymentMethod;
    amount: number;
    occurredAt: Date;
    waitEndsAt: Date;
  }[],
  now: Date,
): MercadoPagoChargeInProgress | null {
  const charge = pendingPayments.find((payment) => inProgress(payment, now));
  return charge === undefined
    ? null
    : {
        paymentTransactionId: charge.id,
        method: charge.method,
        amount: charge.amount,
        remainingSeconds: mercadoPagoOrderChargeRemainingSeconds(charge.waitEndsAt, now),
        waitSeconds: mercadoPagoOrderChargeWaitSeconds(charge.occurredAt, charge.waitEndsAt),
      };
}
