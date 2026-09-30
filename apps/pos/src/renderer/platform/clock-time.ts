import { ARGENTINA_TIME_ZONE } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";

export function formatClockTime(instant: string): string {
  return formatDate(new Date(instant), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ARGENTINA_TIME_ZONE,
  });
}
