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
  state: "PENDING",
} as const;
