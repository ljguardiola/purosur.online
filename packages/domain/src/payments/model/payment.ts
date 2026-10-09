interface ApprovedPayment {
  id: string;
  saleId: string;
  kind: "SALE";
  amount: number;
  state: "APPROVED";
  occurredAt: Date;
}

interface CashPayment extends ApprovedPayment {
  method: "CASH";
  provider: "NONE";
  tendered?: number;
}

interface TransferPayment extends ApprovedPayment {
  method: "TRANSFER";
  provider: "NONE";
  tendered?: never;
  authorizedBy: string;
  confirmedAt: Date;
}

interface MercadoPagoQrPayment extends ApprovedPayment {
  method: "QR";
  provider: "MERCADOPAGO_QR";
  tendered?: never;
  authorizedBy?: never;
  confirmedAt?: never;
}

export type PaymentTransaction = CashPayment | TransferPayment | MercadoPagoQrPayment;

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "QR"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function hasApprovedPayment(payments: readonly { state: string }[]): boolean {
  return payments.some((payment) => payment.state === "APPROVED");
}

export function cancellableWithoutAuthorization(payments: readonly { state: string }[]): boolean {
  return !hasApprovedPayment(payments);
}
