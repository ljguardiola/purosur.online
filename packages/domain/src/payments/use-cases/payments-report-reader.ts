import type { ReportPeriod } from "../../shared/index.js";
import type { PaymentMethod } from "../model/payment.js";

export interface ApprovedPaymentsQuery {
  locationId: string;
  period: ReportPeriod;
  registerId: string | undefined;
}

export interface SalesPaidByMethod {
  method: PaymentMethod;
  salesCount: number;
  amount: number;
}

export interface ApprovedPaymentsByMethod {
  methods: SalesPaidByMethod[];
  salesCount: number;
  total: number;
}

export interface PaymentsReportReader {
  approvedPaymentsByMethod(query: ApprovedPaymentsQuery): Promise<ApprovedPaymentsByMethod>;
}
