export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const ISO_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export function isoWeekdayOf(day: string): IsoWeekday {
  const sundayFirst = new Date(`${day}T00:00:00Z`).getUTCDay();
  return (sundayFirst === 0 ? 7 : sundayFirst) as IsoWeekday;
}

export function isValidDiscountWeekdays(weekdays: readonly number[]): boolean {
  return (
    weekdays.every((weekday) => ISO_WEEKDAYS.includes(weekday)) &&
    new Set(weekdays).size === weekdays.length
  );
}

export function normalizeDiscountWeekdays(weekdays: readonly number[]): number[] {
  return [...weekdays].sort((a, b) => a - b);
}
