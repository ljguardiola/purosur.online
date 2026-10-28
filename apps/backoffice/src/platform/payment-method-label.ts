import type { PaymentMethod, PointCardType } from "@purosur/domain";

const PAYMENT_METHOD_LABELS = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR de Mercado Pago",
  POINT: "Point integrada",
  STANDALONE_TERMINAL: "Terminal independiente",
} satisfies Record<PaymentMethod, string>;

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method];
}

const POINT_CARD_LABELS = {
  DEBIT: "Point · Débito",
  CREDIT: "Point · Crédito",
} satisfies Record<PointCardType, string>;

export function paymentLabel(method: PaymentMethod, cardType: PointCardType | null): string {
  return method === "POINT" && cardType !== null
    ? POINT_CARD_LABELS[cardType]
    : paymentMethodLabel(method);
}
