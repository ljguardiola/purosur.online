import type {
  PaymentTransactionDirectory,
  PaymentTransactionReference,
} from "../mercado-pago-notification-ports.js";
import type { FakePaymentTransactionLanes } from "./fake-payment-transaction-lanes.js";

export class FakePaymentTransactionDirectory implements PaymentTransactionDirectory {
  staleReferenceOfOrder: PaymentTransactionReference | undefined;
  staleListing: PaymentTransactionReference[] | undefined;
  private readonly lanes: FakePaymentTransactionLanes;

  constructor(lanes: FakePaymentTransactionLanes) {
    this.lanes = lanes;
  }

  async paymentTransactionOfOrder(
    providerOrderId: string,
  ): Promise<PaymentTransactionReference | null> {
    this.lanes.operations.push(`paymentTransactionOfOrder ${providerOrderId}`);
    if (this.staleReferenceOfOrder) {
      return this.staleReferenceOfOrder;
    }
    const found = [...this.lanes.transactions.values()].find(
      (transaction) => transaction.providerOrderId === providerOrderId,
    );
    return found ? { id: found.id, registerId: found.registerId } : null;
  }

  async pendingPaymentTransactions(): Promise<PaymentTransactionReference[]> {
    this.lanes.operations.push("pendingPaymentTransactions");
    if (this.staleListing) {
      return this.staleListing;
    }
    return [...this.lanes.transactions.values()]
      .filter((transaction) => transaction.state === "PENDING")
      .map(({ id, registerId }) => ({ id, registerId }));
  }
}
