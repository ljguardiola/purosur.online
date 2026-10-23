import { cashSessionClosesSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const CLOSED_TIME_ZONE = schemaText(
  cashSessionClosesSchema.shape.sessions.element.shape.closed_at.meta()?.["timeZone"],
);

export function cashSessionCloseMoment(instant: string): { date: string; time: string } {
  const moment = new Date(instant);
  return {
    date: formatDate(moment, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: CLOSED_TIME_ZONE,
    }),
    time: formatDate(moment, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: CLOSED_TIME_ZONE,
    }),
  };
}
