export const PENDING_QR_TRANSACTION = {
  kind: "SALE",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  state: "PENDING",
} as const;

export const PENDING_POINT_TRANSACTION = {
  kind: "SALE",
  method: "POINT",
  provider: "MERCADOPAGO_POINT",
  cardType: "DEBIT",
  state: "PENDING",
} as const;
