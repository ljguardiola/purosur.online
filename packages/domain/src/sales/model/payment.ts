type PaymentMethod = "CASH";

type PaymentProvider = "NONE";

type PaymentState = "APPROVED";

export interface PaymentTransaction {
  id: string;
  saleId: string;
  kind: "SALE";
  method: PaymentMethod;
  provider: PaymentProvider;
  amount: number;
  tendered?: number;
  state: PaymentState;
  occurredAt: Date;
}

export function cancellableWithoutAuthorization(payments: readonly { state: string }[]): boolean {
  return !payments.some((payment) => payment.state === "APPROVED");
}
