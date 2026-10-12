import type { LatePaymentRefund } from "../../model/payment-refund.js";
import type { LatePaymentRefundOpening } from "../mercado-pago-qr-order-ports.js";
import type {
  QrPaymentReplacement,
  QrPaymentReplacementStore,
  QrPaymentReplacementTransaction,
  ReplacedQrPayment,
} from "../qr-payment-replacement-store.js";

export interface FakeRecordedQrPayment extends ReplacedQrPayment {
  registerId: string;
  saleId: string;
}

export interface OpenedLatePaymentRefund {
  refund: LatePaymentRefund;
  openedAt: Date;
}

type ReplacementWrite = "markReplaced" | "openLatePaymentRefund";

class FakeQrPaymentReplacementTransaction implements QrPaymentReplacementTransaction {
  private readonly store: FakeQrPaymentReplacements;

  constructor(store: FakeQrPaymentReplacements) {
    this.store = store;
  }

  async markReplaced({
    registerId,
    paymentTransactionId,
    saleId,
  }: QrPaymentReplacement): Promise<ReplacedQrPayment | null> {
    this.store.operations.push("markReplaced");
    this.store.failIfAsked("markReplaced");
    const payment = this.store.payments.find(
      (stored) =>
        stored.id === paymentTransactionId &&
        stored.registerId === registerId &&
        stored.saleId === saleId,
    );
    if (!payment) {
      return null;
    }
    payment.replaced = true;
    const { registerId: _register, saleId: _sale, ...replaced } = payment;
    return structuredClone(replaced);
  }

  async openLatePaymentRefund(
    refund: LatePaymentRefund,
    openedAt: Date,
  ): Promise<LatePaymentRefundOpening> {
    this.store.operations.push("openLatePaymentRefund");
    this.store.failIfAsked("openLatePaymentRefund");
    if (
      this.store.refunds.some(
        (opened) =>
          opened.refund.paymentId === refund.paymentId &&
          opened.refund.providerOrderId === refund.providerOrderId,
      )
    ) {
      return "already_open";
    }
    this.store.refunds.push({ refund: structuredClone(refund), openedAt: new Date(openedAt) });
    return "opened";
  }
}

export class FakeQrPaymentReplacements implements QrPaymentReplacementStore {
  payments: FakeRecordedQrPayment[];
  refunds: OpenedLatePaymentRefund[] = [];
  operations: string[] = [];
  transactions = 0;
  failOn: ReplacementWrite | undefined;

  constructor(payments: FakeRecordedQrPayment[] = []) {
    this.payments = structuredClone(payments);
  }

  failIfAsked(write: ReplacementWrite) {
    if (this.failOn === write) {
      throw new Error(`${write} failed`);
    }
  }

  async inOneTransaction<TOutcome>(
    work: (tx: QrPaymentReplacementTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const payments = structuredClone(this.payments);
    const refunds = structuredClone(this.refunds);
    try {
      return await work(new FakeQrPaymentReplacementTransaction(this));
    } catch (error) {
      this.payments = payments;
      this.refunds = refunds;
      throw error;
    }
  }
}
