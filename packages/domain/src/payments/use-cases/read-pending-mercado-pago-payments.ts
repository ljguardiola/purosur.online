import type { MercadoPagoPaymentMethod } from "../model/payment.js";
import {
  type PaymentTransactionState,
  PENDING_PAYMENT_TRANSACTION_STATE,
} from "../model/payment-transaction.js";

export interface MercadoPagoPaymentSummary {
  paymentId: string;
  saleId: string;
  method: MercadoPagoPaymentMethod;
  amount: number;
  occurredAt: Date;
}

export interface MercadoPagoPayments {
  unreplacedPaymentsIn(state: PaymentTransactionState): MercadoPagoPaymentSummary[];
}

export function readPendingMercadoPagoPayments({
  payments,
}: {
  payments: MercadoPagoPayments;
}): MercadoPagoPaymentSummary[] {
  return payments.unreplacedPaymentsIn(PENDING_PAYMENT_TRANSACTION_STATE);
}
