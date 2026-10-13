import { MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS } from "./mercado-pago-point-order.js";

export const POINT_TERMINAL_AVAILABILITIES = ["available", "offline", "below_minimum"] as const;

export type PointTerminalAvailability = (typeof POINT_TERMINAL_AVAILABILITIES)[number];

export const QR_AVAILABILITIES = ["available", "offline"] as const;

export type QrAvailability = (typeof QR_AVAILABILITIES)[number];

export function qrAvailability(cloudReachable: boolean): QrAvailability {
  return cloudReachable ? "available" : "offline";
}

export function pointTerminalAvailability(
  cloudReachable: boolean,
  pendingCents: number,
): PointTerminalAvailability {
  if (!cloudReachable) {
    return "offline";
  }
  return pendingCents < MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS ? "below_minimum" : "available";
}
