import type { PaymentMethod } from "@purosur/domain";

export const PAYMENT_METHOD_NAMES = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR de Mercado Pago",
  POINT: "Point integrada",
  STANDALONE_TERMINAL: "Terminal independiente",
} as const satisfies Record<PaymentMethod, string>;

export function paymentMethodName(method: PaymentMethod): string {
  return PAYMENT_METHOD_NAMES[method];
}
