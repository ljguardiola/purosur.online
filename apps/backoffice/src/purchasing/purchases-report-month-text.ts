import { formatDate } from "@purosur/ui";

export function purchasesReportMonthText(month: string): string {
  return formatDate(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
