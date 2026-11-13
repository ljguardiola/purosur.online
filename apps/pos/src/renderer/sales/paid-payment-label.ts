import type { OpenSale } from "@purosur/contracts";

type PaidPayment = OpenSale["payments"][number];

const METHOD_LABELS = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR",
  POINT: "Point",
  STANDALONE_TERMINAL: "Terminal independiente",
} as const satisfies Record<PaidPayment["method"], string>;

const POINT_CARD_LABELS = {
  DEBIT: "Point débito",
  CREDIT: "Point crédito",
} as const satisfies Record<NonNullable<PaidPayment["card_type"]>, string>;

export function paidPaymentLabel({ method, card_type }: PaidPayment): string {
  return method === "POINT" && card_type !== null
    ? POINT_CARD_LABELS[card_type]
    : METHOD_LABELS[method];
}
