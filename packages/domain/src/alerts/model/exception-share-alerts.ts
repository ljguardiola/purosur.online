import { nonCompliantMonthsOfYear, type RecordedExceptionShareBreach } from "../../fiscal/index.js";
import type { OpenAlertInput } from "./alert-details.js";

export function fiscalAddressMonthScope(fiscalAddressId: string, month: string): string {
  return `${fiscalAddressId}:${month}`;
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
