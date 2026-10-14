import { formatDisplayDate } from "../platform/display-date";

export function reportPeriodText({ from, to }: { from: string; to: string }): string {
  return from === to
    ? `El ${formatDisplayDate(from)}`
    : `Del ${formatDisplayDate(from)} al ${formatDisplayDate(to)}`;
}
