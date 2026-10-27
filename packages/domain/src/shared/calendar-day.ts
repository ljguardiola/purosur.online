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

export function lastDayOfMonth(day: string): string {
  const first = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + 1);
  return shiftCalendarDay(first.toISOString().slice(0, 10), -1);
}

export function addCalendarMonths(day: string, months: number): string {
  const monthIndex = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 + months;
  const year = String(Math.floor(monthIndex / 12)).padStart(4, "0");
  const month = String((monthIndex % 12) + 1).padStart(2, "0");
  const lastDay = Number(lastDayOfMonth(`${year}-${month}-01`).slice(8));
  const dayOfMonth = String(Math.min(Number(day.slice(8)), lastDay)).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}
