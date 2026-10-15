import type { ReportPeriod } from "../../shared/index.js";
import type { HandConfirmedPayment } from "../model/hand-confirmed-payments-reconciliation.js";
import type { ConfirmedByHandMethod } from "../model/payment.js";

export interface HandConfirmedPaymentsQuery {
  locationId: string;
  period: ReportPeriod;
  registerId: string | undefined;
  method: ConfirmedByHandMethod | undefined;
}

export interface HandConfirmedPaymentsReader {
  handConfirmedPayments(query: HandConfirmedPaymentsQuery): Promise<HandConfirmedPayment[]>;
}
