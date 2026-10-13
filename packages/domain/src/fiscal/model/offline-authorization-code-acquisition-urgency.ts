import { shiftCalendarDay } from "../../shared/index.js";
import {
  type Fortnight,
  offlineAuthorizationCodeRequestOpensOn,
} from "./offline-authorization-code.js";

export type OfflineAuthorizationCodeAcquisitionUrgency = "early" | "due" | "pressing";

const DUE_AFTER_WINDOW_OPENS_DAYS = 2;
const PRESSING_BEFORE_FORTNIGHT_STARTS_DAYS = 1;

export function offlineAuthorizationCodeAcquisitionUrgency(
  fortnight: Fortnight,
  day: string,
): OfflineAuthorizationCodeAcquisitionUrgency | null {
  const opensOn = offlineAuthorizationCodeRequestOpensOn(fortnight);
  if (day < opensOn || day > fortnight.end) {
    return null;
  }
  if (day >= shiftCalendarDay(fortnight.start, -PRESSING_BEFORE_FORTNIGHT_STARTS_DAYS)) {
    return "pressing";
  }
  if (day >= shiftCalendarDay(opensOn, DUE_AFTER_WINDOW_OPENS_DAYS)) {
    return "due";
  }
  return "early";
}
