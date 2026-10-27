import { addCalendarMonths, argentinaCalendarDay, shiftCalendarDay } from "../../shared/index.js";
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
): string {
  const soldOn = argentinaCalendarDay(soldAt);
  return reason === "defective"
    ? addCalendarMonths(soldOn, DEFECT_RETURN_MONTHS)
    : shiftCalendarDay(soldOn, goodConditionReturnDays);
}

export function isReturnWindowOpen(lastDay: string, now: Date): boolean {
  return argentinaCalendarDay(now) <= lastDay;
}

export function returnWindows(
  soldAt: Date,
  goodConditionReturnDays: number,
  now: Date,
): Record<ReturnReason, ReturnWindow> {
  const windowOf = (reason: ReturnReason): ReturnWindow => {
    const lastAllowedDay = returnWindowLastDay(reason, soldAt, goodConditionReturnDays);
    return { lastAllowedDay, open: isReturnWindowOpen(lastAllowedDay, now) };
  };
  return { change_of_mind: windowOf("change_of_mind"), defective: windowOf("defective") };
}
