import { type CalendarDate, parseDate } from "@internationalized/date";
export function calendarDateOf(day: string): CalendarDate {
  return parseDate(day);
}

export function dayOf(date: CalendarDate): string {
  return date.toString();
}

export function hasFourDigitYear(date: CalendarDate): boolean {
  return date.year >= 1000;
}
