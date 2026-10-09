export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function isoWeekdayOf(day: string): IsoWeekday {
  const sundayFirst = new Date(`${day}T00:00:00Z`).getUTCDay();
  return (sundayFirst === 0 ? 7 : sundayFirst) as IsoWeekday;
}
