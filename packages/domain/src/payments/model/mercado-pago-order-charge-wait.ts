export const MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES = 3;

export const MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS = 3_000;

export type MercadoPagoOrderChargeWait =
  | { kind: "waiting"; remainingSeconds: number }
  | { kind: "over" };

export function mercadoPagoOrderChargeWaitEndsAt(chargeStartedAt: Date): Date {
  return new Date(chargeStartedAt.getTime() + MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES * 60 * 1000);
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

export function aMercadoPagoChargeInItsWait(
  pendingMercadoPagoPayments: readonly { waitEndsAt: Date }[],
  now: Date,
): boolean {
  return pendingMercadoPagoPayments.some(
    ({ waitEndsAt }) => mercadoPagoOrderChargeWait(waitEndsAt, now).kind === "waiting",
  );
}
