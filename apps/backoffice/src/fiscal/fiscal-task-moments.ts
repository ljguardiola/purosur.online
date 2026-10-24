import { fiscalTaskItemSchema } from "@purosur/contracts";
import { formatDate, formatDayAndTime } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const FISCAL_TASK_TIME_ZONE = schemaText(
  fiscalTaskItemSchema.options[0].shape.created_at.meta()?.["timeZone"],
);

export function fiscalTaskDate(instant: string): string {
  return formatDate(new Date(instant), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FISCAL_TASK_TIME_ZONE,
  });
}

export function fiscalTaskDayAndTime(instant: string): string {
  return formatDayAndTime(instant, FISCAL_TASK_TIME_ZONE);
}
