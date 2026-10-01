import { formatDate } from "@purosur/ui";

export function formatDisplayDate(isoDate: string): string {
  return formatDate(Date.parse(isoDate), {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
