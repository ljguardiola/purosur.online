// PostgreSQL's date has no year 0, which JavaScript's Date does.
export function isCalendarDay(day: string): boolean {
  const parsed = new Date(`${day}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() > 0 &&
    parsed.toISOString().slice(0, 10) === day
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function shiftCalendarDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
