import { addCalendarMonths } from "../../shared/index.js";
import type { ContingencyTimeMeasurement } from "./contingency-time-share.js";
import { monthOfDay } from "./exception-share.js";

export interface MonthAtRiskOfSecondConsecutiveBreach {
  month: string;
  previousMonth: string;
}

export function monthAtRiskOfSecondConsecutiveBreach(
  today: string,
): MonthAtRiskOfSecondConsecutiveBreach {
  return {
    month: monthOfDay(today),
    previousMonth: monthOfDay(addCalendarMonths(today, -1)),
  };
}

export const NON_COMPLIANT_MEASUREMENTS = ["exception_share", "contingency_time"] as const;

export type NonCompliantMeasurement = (typeof NON_COMPLIANT_MEASUREMENTS)[number];

export function nonCompliantMeasurementsOfMonth({
  exceptionShareRecorded,
  contingencyTime,
}: {
  exceptionShareRecorded: boolean;
  contingencyTime: ContingencyTimeMeasurement;
}): NonCompliantMeasurement[] {
  const measurements: NonCompliantMeasurement[] = [];
  if (exceptionShareRecorded) {
    measurements.push("exception_share");
  }
  if (contingencyTime.state === "non_compliant") {
    measurements.push("contingency_time");
  }
  return measurements;
}
