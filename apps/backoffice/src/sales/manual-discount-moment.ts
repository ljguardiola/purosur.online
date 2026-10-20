import { manualDiscountsSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const MOMENT_TIME_ZONE = schemaText(
  manualDiscountsSchema.shape.rows.element.options[0].shape.completed_at.meta()?.["timeZone"],
);

export function manualDiscountMoment(instant: string): { date: string; time: string } {
  const moment = new Date(instant);
  return {
    date: formatDate(moment, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: MOMENT_TIME_ZONE,
    }),
    time: formatDate(moment, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: MOMENT_TIME_ZONE,
    }),
  };
}
