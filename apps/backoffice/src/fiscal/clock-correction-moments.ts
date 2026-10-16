import { clockCorrectionSchema } from "@purosur/contracts";
import { formatDate, formatDayAndTime } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const CLOCK_CORRECTION_TIME_ZONE = schemaText(
  clockCorrectionSchema.shape.corrected_at.meta()?.["timeZone"],
);

export function clockCorrectionDay(instant: string): string {
  return formatDate(new Date(instant), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: CLOCK_CORRECTION_TIME_ZONE,
  });
}

export function clockCorrectionTime(instant: string): string {
  return formatDate(new Date(instant), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: CLOCK_CORRECTION_TIME_ZONE,
  });
}

export function clockCorrectionReading(instant: string): string {
  return formatDayAndTime(instant, CLOCK_CORRECTION_TIME_ZONE);
}
