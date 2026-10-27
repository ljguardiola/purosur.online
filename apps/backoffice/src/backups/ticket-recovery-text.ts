import { formatDayAndTime } from "@purosur/ui";
import { OCCURRED_AT_TIME_ZONE } from "./rescued-ticket-text";

export function recoveryAwaitingSinceText(openedAt: string): string {
  return formatDayAndTime(openedAt, OCCURRED_AT_TIME_ZONE);
}
