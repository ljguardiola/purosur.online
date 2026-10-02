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

const OFFSET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: ARGENTINA_TIME_ZONE,
  timeZoneName: "longOffset",
});

function argentinaOffsetAt(instant: Date): string {
  return OFFSET_FORMAT.format(instant).slice(-6);
}

// Reading the wall-clock time as UTC lands up to a few hours off the real instant, which can fall
// on the other side of a clock change; the offset is taken again at the instant it first names.
export function argentinaInstant(day: string, time: string): string {
  const wallClock = `${day}T${time}:00`;
  const firstGuess = new Date(`${wallClock}${argentinaOffsetAt(new Date(`${wallClock}Z`))}`);
  return `${wallClock}${argentinaOffsetAt(firstGuess)}`;
}
