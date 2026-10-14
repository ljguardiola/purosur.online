import { PAID_ORDER_PAYMENT_STATE, PAID_ORDER_REPLACED } from "../../model/paid-order-discovery.js";
import type { ApprovedOrderOfRegister, ApprovedOrdersOfRegister } from "../paid-order-ports.js";
import type { FakePaymentTransactionLanes } from "./fake-payment-transaction-lanes.js";

export class FakeApprovedOrdersOfRegister implements ApprovedOrdersOfRegister {
  private readonly lanes: FakePaymentTransactionLanes;

  constructor(lanes: FakePaymentTransactionLanes) {
    this.lanes = lanes;
  }

  async approvedWithoutSaleSince(
    registerId: string,
    since: Date,
  ): Promise<ApprovedOrderOfRegister[]> {
    return [...this.lanes.transactions.values()]
      .filter(
        (transaction) =>
          transaction.registerId === registerId &&
          transaction.state === PAID_ORDER_PAYMENT_STATE &&
          transaction.replaced === PAID_ORDER_REPLACED &&
          !this.lanes.heldBySales.has(transaction.id) &&
          transaction.createdAt.getTime() >= since.getTime(),
      )
      .map((transaction) => ({
        paymentTransactionId: transaction.id,
        saleId: transaction.saleId,
        method: transaction.method,
        provider: transaction.provider,
        amount: transaction.amount,
        createdAt: new Date(transaction.createdAt),
      }));
  }
}
