import type { PaymentTransactionState } from "../../model/payment-transaction.js";
import type {
  MercadoPagoPaymentSummary,
  MercadoPagoPayments,
} from "../read-pending-mercado-pago-payments.js";

type StoredPayment = MercadoPagoPaymentSummary & {
  state: PaymentTransactionState;
  replaced: boolean;
};

export class FakeMercadoPagoPayments implements MercadoPagoPayments {
  private readonly payments: StoredPayment[];

  constructor(payments: StoredPayment[] = []) {
    this.payments = payments;
  }

  unreplacedPaymentsIn(state: PaymentTransactionState): MercadoPagoPaymentSummary[] {
    return this.payments
      .filter((payment) => payment.state === state && !payment.replaced)
      .map(({ state: _state, replaced: _replaced, ...payment }) => payment);
  }
}
