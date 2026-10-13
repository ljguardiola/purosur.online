import type {
  ApprovedPaymentsByMethod,
  ApprovedPaymentsQuery,
  PaymentsReportReader,
} from "../payments-report-reader.js";

const NO_PAYMENTS: ApprovedPaymentsByMethod = { methods: [], salesCount: 0, total: 0 };

export class FakePaymentsReportReader implements PaymentsReportReader {
  readonly approvedPaymentsReads: ApprovedPaymentsQuery[] = [];
  private readonly payments: ApprovedPaymentsByMethod;

  constructor(payments: ApprovedPaymentsByMethod = NO_PAYMENTS) {
    this.payments = payments;
  }

  async approvedPaymentsByMethod(query: ApprovedPaymentsQuery): Promise<ApprovedPaymentsByMethod> {
    this.approvedPaymentsReads.push({ ...query, period: { ...query.period } });
    return { ...this.payments, methods: this.payments.methods.map((method) => ({ ...method })) };
  }
}
