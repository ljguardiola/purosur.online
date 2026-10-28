import type { PaymentMethod, PointCardType } from "@purosur/domain";

export const PAYMENT_METHOD_NAMES = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR de Mercado Pago",
  POINT: "Point",
  STANDALONE_TERMINAL: "Terminal independiente",
} as const satisfies Record<PaymentMethod, string>;

export function paymentMethodName(method: PaymentMethod): string {
  return PAYMENT_METHOD_NAMES[method];
}

const POINT_CARD_NAMES = {
  DEBIT: "Point · Débito",
  CREDIT: "Point · Crédito",
} as const satisfies Record<PointCardType, string>;

export function pointCardName(cardType: PointCardType | null): string {
  return cardType === null ? PAYMENT_METHOD_NAMES.POINT : POINT_CARD_NAMES[cardType];
}

export function paidPaymentName(method: PaymentMethod, cardType: PointCardType | null): string {
  return method === "POINT" ? pointCardName(cardType) : paymentMethodName(method);
}
