import { MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS } from "./mercado-pago-point-order.js";

export const POINT_TERMINAL_AVAILABILITIES = [
  "available",
  "offline",
  "below_minimum",
  "not_configured",
] as const;

export type PointTerminalAvailability = (typeof POINT_TERMINAL_AVAILABILITIES)[number];

export const QR_AVAILABILITIES = ["available", "offline", "not_configured"] as const;

export type QrAvailability = (typeof QR_AVAILABILITIES)[number];

export function qrAvailability({
  pointOfSaleAssigned,
  cloudReachable,
}: {
  pointOfSaleAssigned: boolean;
  cloudReachable: boolean;
}): QrAvailability {
  if (!pointOfSaleAssigned) {
    return "not_configured";
  }
  return cloudReachable ? "available" : "offline";
}

export function pointTerminalAvailability({
  terminalAssigned,
  cloudReachable,
  pendingCents,
}: {
  terminalAssigned: boolean;
  cloudReachable: boolean;
  pendingCents: number;
}): PointTerminalAvailability {
  if (!terminalAssigned) {
    return "not_configured";
  }
  if (!cloudReachable) {
    return "offline";
  }
  return pendingCents < MERCADO_PAGO_POINT_MINIMUM_ORDER_CENTS ? "below_minimum" : "available";
}
