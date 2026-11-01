import { nonCompliantMonthsOfYear, type RecordedExceptionShareBreach } from "../../fiscal/index.js";
import type { OpenAlertInput } from "./alert-details.js";

export function fiscalAddressMonthScope(fiscalAddressId: string, month: string): string {
  return `${fiscalAddressId}:${month}`;
}

const FISCAL_ADDRESS_MONTH_SCOPE = /^([^:]+):(\d{4}-(?:0[1-9]|1[0-2]))$/;

export function fiscalAddressMonthScopeFiscalAddressId(scope: string): string | undefined {
  return FISCAL_ADDRESS_MONTH_SCOPE.exec(scope)?.[1];
}

export function fiscalAddressMonthScopeDisplay(scope: string, fiscalAddressName: string): string {
  const match = FISCAL_ADDRESS_MONTH_SCOPE.exec(scope);
  return match === null ? scope : `${fiscalAddressName}:${match[2]}`;
}

export function exceptionShareBreachAlert(
  {
    fiscalAddressId,
    fiscalAddressName,
    month,
    exceptionCount,
    totalCount,
  }: RecordedExceptionShareBreach,
  fiscalAddressBreachMonths: readonly string[],
): OpenAlertInput {
  return {
    kind: "exception_share_breach",
    scope: fiscalAddressMonthScope(fiscalAddressId, month),
    detail: {
      fiscalAddressId,
      fiscalAddressName,
      month,
      exceptionCount,
      totalCount,
      nonCompliantMonths: nonCompliantMonthsOfYear(
        Number(month.slice(0, 4)),
        fiscalAddressBreachMonths,
      ),
    },
  };
}
