import { isCalendarDay } from "../../shared/index.js";

const UNREPORTED_NIGHT_DEADLINE_HOUR_UTC = 21;
const HOUR_MS = 60 * 60 * 1000;

export function isOffsiteDumpNight(value: string): boolean {
  return isCalendarDay(value);
}

export function dueOffsiteDumpNight(now: Date): string {
  return new Date(now.getTime() - UNREPORTED_NIGHT_DEADLINE_HOUR_UTC * HOUR_MS)
    .toISOString()
    .slice(0, 10);
}

export function offsiteDumpNightOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}
