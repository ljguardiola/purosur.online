import { addCalendarMonths } from "../../shared/index.js";
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
