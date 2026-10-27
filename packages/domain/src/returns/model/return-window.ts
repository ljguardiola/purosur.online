import {
  addCalendarMonths,
  argentinaCalendarDay,
  shiftCalendarDay,
  type ZoneRules,
} from "../../shared/index.js";
import type { ReturnReason } from "./return-reasons.js";

export const DEFECT_RETURN_MONTHS = 6;

export interface ReturnWindow {
  lastAllowedDay: string;
  open: boolean;
}

export function returnWindowLastDay(
  reason: ReturnReason,
  soldAt: Date,
  goodConditionReturnDays: number,
  rules: ZoneRules,
): string {
  const soldOn = argentinaCalendarDay(soldAt, rules);
  return reason === "defective"
    ? addCalendarMonths(soldOn, DEFECT_RETURN_MONTHS)
    : shiftCalendarDay(soldOn, goodConditionReturnDays);
}

export function isReturnWindowOpen(lastDay: string, now: Date, rules: ZoneRules): boolean {
  return argentinaCalendarDay(now, rules) <= lastDay;
}

export function returnWindows(
  soldAt: Date,
  goodConditionReturnDays: number,
  now: Date,
  rules: ZoneRules,
): Record<ReturnReason, ReturnWindow> {
  const windowOf = (reason: ReturnReason): ReturnWindow => {
    const lastAllowedDay = returnWindowLastDay(reason, soldAt, goodConditionReturnDays, rules);
    return { lastAllowedDay, open: isReturnWindowOpen(lastAllowedDay, now, rules) };
  };
  return { change_of_mind: windowOf("change_of_mind"), defective: windowOf("defective") };
}
