// The business operates only in Argentina, so "today" means Argentina's calendar day: the UTC
// day is already tomorrow after 21:00 local time.
export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

// The en-CA locale formats a date as YYYY-MM-DD, the ISO calendar date shape.
const ISO_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function argentinaCalendarDay(instant: Date): string {
  return ISO_DAY_FORMAT.format(instant);
}

// Argentina has kept UTC−3 all year, with no daylight saving time, since 2009.
const ARGENTINA_OFFSET = "-03:00";

export function argentinaInstant(day: string, time: string): string {
  return `${day}T${time}:00${ARGENTINA_OFFSET}`;
}
