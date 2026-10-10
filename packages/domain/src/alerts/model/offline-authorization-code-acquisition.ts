import { type Fortnight, offlineAuthorizationCodeRequestOpensOn } from "../../fiscal/index.js";
import { shiftCalendarDay } from "../../shared/index.js";
import type { AlertLevel } from "./alert-catalog.js";

const WARNING_AFTER_WINDOW_OPENS_DAYS = 2;
const CRITICAL_BEFORE_FORTNIGHT_STARTS_DAYS = 1;

export function offlineAuthorizationCodeAcquisitionLevel(
  fortnight: Fortnight,
  day: string,
): AlertLevel | null {
  const opensOn = offlineAuthorizationCodeRequestOpensOn(fortnight);
  if (day < opensOn || day > fortnight.end) {
    return null;
  }
  if (day >= shiftCalendarDay(fortnight.start, -CRITICAL_BEFORE_FORTNIGHT_STARTS_DAYS)) {
    return "critical";
  }
  if (day >= shiftCalendarDay(opensOn, WARNING_AFTER_WINDOW_OPENS_DAYS)) {
    return "warning";
  }
  return "informational";
}
