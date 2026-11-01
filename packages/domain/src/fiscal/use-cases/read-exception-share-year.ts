import { argentinaCalendarDay } from "../../shared/index.js";
import {
  EXCEPTION_SHARE_NON_COMPLIANCE_PERCENT,
  type ExceptionShareMonthState,
  exceptionShareMonthState,
  exceptionShareTenthsOfPercent,
  isMonthClosed,
  monthsStartedInYear,
  nonCompliantMonthsOfYear,
  selectableExceptionShareYears,
} from "../model/exception-share.js";
import type {
  ExceptionShareFiscalAddress,
  ReadExceptionShareYearPorts,
} from "./read-exception-share-year-ports.js";

export interface ReadExceptionShareYearInput {
  fiscalAddressId: string;
  year?: number | undefined;
}

export interface ExceptionShareYearMonth {
  month: string;
  exceptionCount: number;
  totalCount: number;
  shareTenthsOfPercent: number | null;
  state: ExceptionShareMonthState;
}

export type ReadExceptionShareYearOutcome =
  | { kind: "fiscal_address_not_found" }
  | {
      kind: "read";
      fiscalAddress: ExceptionShareFiscalAddress;
      year: number;
      selectableYears: number[];
      nonCompliancePercent: number;
      months: ExceptionShareYearMonth[];
      nonCompliantMonths: string[];
    };

export async function readExceptionShareYear(
  { reader, clock, zoneRules }: ReadExceptionShareYearPorts,
  { fiscalAddressId, year: askedYear }: ReadExceptionShareYearInput,
): Promise<ReadExceptionShareYearOutcome> {
  const fiscalAddress = await reader.fiscalAddress(fiscalAddressId);
  if (fiscalAddress === undefined) {
    return { kind: "fiscal_address_not_found" };
  }
  const today = argentinaCalendarDay(clock.now(), zoneRules.zoneRules());
  const year = askedYear ?? Number(today.slice(0, 4));
  const query = { fiscalAddressId, year };
  const countsByMonth = new Map(
    (await reader.monthlyVoucherCounts(query)).map((each) => [each.month, each]),
  );
  const recorded = new Set(await reader.recordedBreachMonths(query));
  const months = monthsStartedInYear(year, today).map((month) => {
    const { exceptionCount, totalCount } = countsByMonth.get(month) ?? {
      exceptionCount: 0,
      totalCount: 0,
    };
    const counts = { exceptionCount, totalCount };
    return {
      month,
      ...counts,
      shareTenthsOfPercent: exceptionShareTenthsOfPercent(counts),
      state: exceptionShareMonthState({
        counts,
        closed: isMonthClosed(month, today),
        recorded: recorded.has(month),
      }),
    };
  });
  return {
    kind: "read",
    fiscalAddress,
    year,
    selectableYears: selectableExceptionShareYears(today),
    nonCompliancePercent: EXCEPTION_SHARE_NON_COMPLIANCE_PERCENT,
    months,
    nonCompliantMonths: nonCompliantMonthsOfYear(
      year,
      months.filter((each) => each.state === "non_compliant").map((each) => each.month),
    ),
  };
}
