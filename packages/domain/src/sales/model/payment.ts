export type PaymentMethod = "CASH";

export type PaymentProvider = "NONE";

export type PaymentState = "APPROVED";

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
