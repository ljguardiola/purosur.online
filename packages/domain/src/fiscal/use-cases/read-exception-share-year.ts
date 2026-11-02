import { argentinaCalendarDay } from "../../shared/index.js";
import {
  CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT,
  type ContingencyTimeMeasurement,
  contingencyTimeMeasurement,
  monthWindow,
} from "../model/contingency-time-share.js";
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
  contingencyTime: ContingencyTimeMeasurement;
}

export type ReadExceptionShareYearOutcome =
  | { kind: "fiscal_address_not_found" }
  | {
      kind: "read";
      fiscalAddress: ExceptionShareFiscalAddress;
      year: number;
      selectableYears: number[];
      nonCompliancePercent: number;
      contingencyNonCompliancePercent: number;
      months: ExceptionShareYearMonth[];
      nonCompliantMonths: string[];
      contingencyNonCompliantMonths: string[];
    };

export async function readExceptionShareYear(
  { reader, availability, contingency, clock, zoneRules }: ReadExceptionShareYearPorts,
  { fiscalAddressId, year: askedYear }: ReadExceptionShareYearInput,
): Promise<ReadExceptionShareYearOutcome> {
  const fiscalAddress = await reader.fiscalAddress(fiscalAddressId);
  if (fiscalAddress === undefined) {
    return { kind: "fiscal_address_not_found" };
  }
  const now = clock.now();
  const today = argentinaCalendarDay(now, zoneRules.zoneRules());
  const year = askedYear ?? Number(today.slice(0, 4));
  const query = { fiscalAddressId, year };
  const countsByMonth = new Map(
    (await reader.monthlyVoucherCounts(query)).map((each) => [each.month, each]),
  );
  const recorded = new Set(await reader.recordedBreachMonths(query));
  const months: ExceptionShareYearMonth[] = [];
  for (const month of monthsStartedInYear(year, today)) {
    const { exceptionCount, totalCount } = countsByMonth.get(month) ?? {
      exceptionCount: 0,
      totalCount: 0,
    };
    const counts = { exceptionCount, totalCount };
    const window = monthWindow(month, zoneRules.zoneRules());
    const { start: from, end: to } = window;
    months.push({
      month,
      ...counts,
      shareTenthsOfPercent: exceptionShareTenthsOfPercent(counts),
      state: exceptionShareMonthState({
        counts,
        closed: isMonthClosed(month, today),
        recorded: recorded.has(month),
      }),
      contingencyTime: contingencyTimeMeasurement({
        window,
        now,
        runs: await availability.availabilityRuns({ from, to }),
        ...(await contingency.contingencyIntervalsAtFiscalAddress({ fiscalAddressId, from, to })),
      }),
    });
  }
  return {
    kind: "read",
    fiscalAddress,
    year,
    selectableYears: selectableExceptionShareYears(today),
    nonCompliancePercent: EXCEPTION_SHARE_NON_COMPLIANCE_PERCENT,
    contingencyNonCompliancePercent: CONTINGENCY_TIME_NON_COMPLIANCE_PERCENT,
    months,
    nonCompliantMonths: nonCompliantMonthsOfYear(
      year,
      months.filter((each) => each.state === "non_compliant").map((each) => each.month),
    ),
    contingencyNonCompliantMonths: nonCompliantMonthsOfYear(
      year,
      months
        .filter((each) => each.contingencyTime.state === "non_compliant")
        .map((each) => each.month),
    ),
  };
}
