import { handConfirmedPaymentsSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const CONFIRMED_TIME_ZONE = schemaText(
  handConfirmedPaymentsSchema.shape.payments.element.shape.confirmed_at.meta()?.["timeZone"],
);

export function handConfirmedMoment(instant: string): { date: string; time: string } {
  const moment = new Date(instant);
  return {
    date: formatDate(moment, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: CONFIRMED_TIME_ZONE,
    }),
    time: formatDate(moment, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: CONFIRMED_TIME_ZONE,
    }),
  };
}
