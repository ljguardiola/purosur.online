import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type HandConfirmedPaymentsReconciliation,
  reconcileHandConfirmedPayments,
} from "../model/hand-confirmed-payments-reconciliation.js";
import type { ConfirmedByHandMethod } from "../model/payment.js";
import type { HandConfirmedPaymentsReader } from "./hand-confirmed-payments-reader.js";

export interface ReadHandConfirmedPaymentsInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
  method: ConfirmedByHandMethod | undefined;
}

export interface HandConfirmedPaymentsReport extends HandConfirmedPaymentsReconciliation {
  range: ReportPeriod;
}

export async function readHandConfirmedPayments(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: HandConfirmedPaymentsReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId, method }: ReadHandConfirmedPaymentsInput,
): Promise<HandConfirmedPaymentsReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const payments = await reader.handConfirmedPayments({
    locationId,
    period: range,
    registerId,
    method,
  });
  return { range, ...reconcileHandConfirmedPayments(payments) };
}
