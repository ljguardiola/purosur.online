import type { PaymentMethod, PointCardType } from "@purosur/domain";
import { paymentMethodLabel } from "../platform/payment-method-label";

const POINT_CARD_LABELS = {
  DEBIT: "Point · Débito",
  CREDIT: "Point · Crédito",
} satisfies Record<PointCardType, string>;

export function paymentLabel(method: PaymentMethod, cardType: PointCardType | null): string {
  return method === "POINT" && cardType !== null
    ? POINT_CARD_LABELS[cardType]
    : paymentMethodLabel(method);
}
