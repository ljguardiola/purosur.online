import type { MercadoPagoPaymentMethod, PointCardType } from "./payment.js";

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

type MercadoPagoChargeOf =
  | { method: Extract<MercadoPagoPaymentMethod, "QR"> }
  | { method: Extract<MercadoPagoPaymentMethod, "POINT">; cardType: PointCardType | null };

export type MercadoPagoChargeInProgress = MercadoPagoChargeOf & {
  paymentTransactionId: string;
  amount: number;
  remainingSeconds: number;
  waitSeconds: number;
};

export type PendingMercadoPagoCharge = MercadoPagoChargeOf & {
  id: string;
  amount: number;
  occurredAt: Date;
  waitEndsAt: Date;
};

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
  pendingPayments: readonly PendingMercadoPagoCharge[],
  now: Date,
): MercadoPagoChargeInProgress | null {
  const charge = pendingPayments.find((payment) => inProgress(payment, now));
  if (charge === undefined) {
    return null;
  }
  const followed = {
    paymentTransactionId: charge.id,
    amount: charge.amount,
    remainingSeconds: mercadoPagoOrderChargeRemainingSeconds(charge.waitEndsAt, now),
    waitSeconds: mercadoPagoOrderChargeWaitSeconds(charge.occurredAt, charge.waitEndsAt),
  };
  return charge.method === "POINT"
    ? { ...followed, method: charge.method, cardType: charge.cardType }
    : { ...followed, method: charge.method };
}
