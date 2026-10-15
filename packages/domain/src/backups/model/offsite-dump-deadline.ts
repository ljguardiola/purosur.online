import { isCalendarDay } from "../../shared/index.js";

const VERIFICATION_DEADLINE_HOUR_UTC = 15;
const HOUR_MS = 60 * 60 * 1000;

export function isOffsiteDumpNight(value: string): boolean {
  return isCalendarDay(value);
}

export function dueOffsiteDumpNight(now: Date): string {
  return new Date(now.getTime() - VERIFICATION_DEADLINE_HOUR_UTC * HOUR_MS)
    .toISOString()
    .slice(0, 10);
}
