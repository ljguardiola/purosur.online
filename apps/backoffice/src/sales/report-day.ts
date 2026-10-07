import { type CalendarDate, parseDate } from "@internationalized/date";
import { formatDate } from "@purosur/ui";

export function formatReportDay(day: string): string {
  return formatDate(new Date(day), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function calendarDateOf(day: string): CalendarDate {
  return parseDate(day);
}

export function dayOf(date: CalendarDate): string {
  return date.toString();
}

export function hasFourDigitYear(date: CalendarDate): boolean {
  return date.year >= 1000;
}
