// The business operates only in Argentina, so "today" is Argentina's calendar day wherever the
// cloud or a browser happens to run: the UTC day is already tomorrow from 21:00 local time.
export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

// The en-CA locale formats a date as YYYY-MM-DD, the ISO calendar date shape.
const ISO_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day `instant` falls on in Argentina, as a zero-padded ISO date (YYYY-MM-DD). */
export function argentinaCalendarDay(instant: Date): string {
  return ISO_DAY_FORMAT.format(instant);
}
