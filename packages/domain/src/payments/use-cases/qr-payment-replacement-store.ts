import type { MercadoPagoPaymentMethod } from "../model/payment.js";
import type { LatePaymentRefund } from "../model/payment-refund.js";
import type { PaymentTransactionState } from "../model/payment-transaction.js";
import type { LatePaymentRefundOpening } from "./mercado-pago-order-ports.js";

export interface QrPaymentReplacement {
  registerId: string;
  paymentTransactionId: string;
  saleId: string;
}

export interface ReplacedQrPayment {
  id: string;
  method: MercadoPagoPaymentMethod;
  provider: string;
  amount: number;
  state: PaymentTransactionState;
  replaced: boolean;
}

export interface QrPaymentReplacementTransaction {
  markReplaced(replacement: QrPaymentReplacement): Promise<ReplacedQrPayment | null>;
  openLatePaymentRefund(
    refund: LatePaymentRefund,
    openedAt: Date,
  ): Promise<LatePaymentRefundOpening>;
}

export interface QrPaymentReplacementStore {
  inOneTransaction<TOutcome>(
    work: (tx: QrPaymentReplacementTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
