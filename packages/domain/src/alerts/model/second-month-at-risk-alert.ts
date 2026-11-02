import {
  CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT,
  EXCEPTION_SHARE_NON_COMPLIANCE_PERCENT,
  type ExceptionShareCounts,
  exceptionShareTenthsOfPercent,
  type NonCompliantMeasurement,
} from "../../fiscal/index.js";
import type { AlertConditionObservation } from "./alert-condition-observation.js";
import { fiscalAddressMonthScope } from "./exception-share-alerts.js";

export function secondMonthAtRiskObservation(
  address: { fiscalAddressId: string; fiscalAddressName: string },
  month: string,
  previousMonth: string,
  counts: ExceptionShareCounts,
  {
    previousMonthNonCompliantOn,
    contingencyShareTenthsOfPercent,
  }: {
    previousMonthNonCompliantOn: NonCompliantMeasurement[];
    contingencyShareTenthsOfPercent: number | null;
  },
): AlertConditionObservation {
  return {
    holds: true,
    alert: {
      kind: "second_non_compliant_month_at_risk",
      scope: fiscalAddressMonthScope(address.fiscalAddressId, month),
      detail: {
        fiscalAddressId: address.fiscalAddressId,
        fiscalAddressName: address.fiscalAddressName,
        month,
        previousMonth,
        exceptionCount: counts.exceptionCount,
        totalCount: counts.totalCount,
        exceptionShareTenthsOfPercent: exceptionShareTenthsOfPercent(counts),
        exceptionShareNonCompliancePercent: EXCEPTION_SHARE_NON_COMPLIANCE_PERCENT,
        previousMonthNonCompliantOn,
        contingencyShareTenthsOfPercent,
        contingencyNonCompliancePercent: CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT,
      },
    },
  };
}

export function secondMonthNoLongerAtRiskObservation(scope: string): AlertConditionObservation {
  return { holds: false, kind: "second_non_compliant_month_at_risk", scope };
}
