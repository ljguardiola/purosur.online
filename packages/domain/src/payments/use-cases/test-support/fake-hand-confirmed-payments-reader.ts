import type { HandConfirmedPayment } from "../../model/hand-confirmed-payments-reconciliation.js";
import type {
  HandConfirmedPaymentsQuery,
  HandConfirmedPaymentsReader,
} from "../hand-confirmed-payments-reader.js";

export class FakeHandConfirmedPaymentsReader implements HandConfirmedPaymentsReader {
  readonly reads: HandConfirmedPaymentsQuery[] = [];
  private readonly payments: HandConfirmedPayment[];

  constructor(payments: HandConfirmedPayment[] = []) {
    this.payments = payments;
  }

  async handConfirmedPayments(query: HandConfirmedPaymentsQuery): Promise<HandConfirmedPayment[]> {
    this.reads.push({ ...query, period: { ...query.period } });
    return this.payments.map((payment) => ({ ...payment }));
  }
}
