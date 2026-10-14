import type { MercadoPagoPaymentTransaction } from "../model/payment-transaction.js";

export interface ApprovedOrderOfRegister {
  paymentTransactionId: string;
  saleId: string;
  method: MercadoPagoPaymentTransaction["method"];
  provider: MercadoPagoPaymentTransaction["provider"];
  amount: number;
  createdAt: Date;
}

export interface ApprovedOrdersOfRegister {
  approvedUnreplacedSince(registerId: string, since: Date): Promise<ApprovedOrderOfRegister[]>;
}
