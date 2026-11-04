import type { MercadoPagoPaymentMethod } from "../model/payment.js";
import type { LatePaymentRefund } from "../model/payment-refund.js";
import type { PaymentTransactionState } from "../model/payment-transaction.js";
import type { LatePaymentRefundOpening } from "./mercado-pago-order-ports.js";

export interface MercadoPagoPaymentReplacement {
  registerId: string;
  paymentTransactionId: string;
  saleId: string;
}

export interface ReplacedMercadoPagoPayment {
  id: string;
  method: MercadoPagoPaymentMethod;
  provider: string;
  amount: number;
  state: PaymentTransactionState;
  replaced: boolean;
}

export interface MercadoPagoPaymentReplacementTransaction {
  markReplaced(
    replacement: MercadoPagoPaymentReplacement,
  ): Promise<ReplacedMercadoPagoPayment | null>;
  openLatePaymentRefund(
    refund: LatePaymentRefund,
    openedAt: Date,
  ): Promise<LatePaymentRefundOpening>;
}

export interface MercadoPagoPaymentReplacementStore {
  inOneTransaction<TOutcome>(
    work: (tx: MercadoPagoPaymentReplacementTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
