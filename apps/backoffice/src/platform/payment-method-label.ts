import type { PaymentMethod } from "@purosur/domain";

const PAYMENT_METHOD_LABELS = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR de Mercado Pago",
  POINT: "Point integrada",
} satisfies Record<PaymentMethod, string>;

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method];
}
