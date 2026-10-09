export const MERCADO_PAGO_QR_CHARGE_WAIT_MINUTES = 3;

export const MERCADO_PAGO_QR_CHARGE_CHECK_INTERVAL_MS = 3_000;

export type MercadoPagoQrChargeWait =
  | { kind: "waiting"; remainingSeconds: number }
  | { kind: "over" };

export function mercadoPagoQrChargeWaitEndsAt(chargeStartedAt: Date): Date {
  return new Date(chargeStartedAt.getTime() + MERCADO_PAGO_QR_CHARGE_WAIT_MINUTES * 60 * 1000);
}

export function mercadoPagoQrChargeWait(waitEndsAt: Date, now: Date): MercadoPagoQrChargeWait {
  const remainingMs = waitEndsAt.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return { kind: "over" };
  }
  return { kind: "waiting", remainingSeconds: Math.ceil(remainingMs / 1000) };
}
