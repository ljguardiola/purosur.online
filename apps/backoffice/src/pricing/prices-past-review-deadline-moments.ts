import { pricesPastReviewDeadlineReportSchema } from "@purosur/contracts";
import { formatDayAndTime } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const REVIEW_TIME_ZONE = schemaText(
  pricesPastReviewDeadlineReportSchema.shape.prices.element.shape.last_reviewed_at.meta()?.[
    "timeZone"
  ],
);

export function lastReviewedText(instant: string | null): string {
  return instant === null ? "Nunca" : formatDayAndTime(instant, REVIEW_TIME_ZONE);
}
