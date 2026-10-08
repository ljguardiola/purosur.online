interface ApprovedPayment {
  id: string;
  saleId: string;
  kind: "SALE";
  provider: "NONE";
  amount: number;
  state: "APPROVED";
  occurredAt: Date;
}

interface CashPayment extends ApprovedPayment {
  method: "CASH";
  tendered?: number;
}

interface TransferPayment extends ApprovedPayment {
  method: "TRANSFER";
  tendered?: never;
  authorizedBy: string;
  confirmedAt: Date;
}

export type PaymentTransaction = CashPayment | TransferPayment;

export type PaymentMethod = PaymentTransaction["method"];

export function hasApprovedPayment(payments: readonly { state: string }[]): boolean {
  return payments.some((payment) => payment.state === "APPROVED");
}

export function cancellableWithoutAuthorization(payments: readonly { state: string }[]): boolean {
  return !hasApprovedPayment(payments);
}
