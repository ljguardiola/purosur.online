import type { PaymentMethod, PointCardType } from "@purosur/domain";
import { paymentMethodLabel } from "../platform/payment-method-label";

const POINT_CARD_LABELS = {
  DEBIT: "Point · Débito",
  CREDIT: "Point · Crédito",
} satisfies Record<PointCardType, string>;

function pointCardLabel(method: PaymentMethod, cardType: PointCardType | null): string | null {
  return method === "POINT" && cardType !== null ? POINT_CARD_LABELS[cardType] : null;
}

export function paymentLabel(method: PaymentMethod, cardType: PointCardType | null): string {
  return pointCardLabel(method, cardType) ?? paymentMethodLabel(method);
}

export function paymentLabelInSentence(
  method: PaymentMethod,
  cardType: PointCardType | null,
): string {
  return pointCardLabel(method, cardType) ?? paymentMethodLabel(method).toLowerCase();
}
