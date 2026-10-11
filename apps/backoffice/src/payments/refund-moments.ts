import { pendingRefundsSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const REFUND_TIME_ZONE = schemaText(
  pendingRefundsSchema.shape.refunds.element.shape.occurred_at.meta()?.["timeZone"],
);

const DAY_AND_MONTH_LENGTH = "dd/mm".length;

export function refundDate(instant: string): string {
  return formatDate(new Date(instant), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: REFUND_TIME_ZONE,
  });
}

export function refundDayAndTime(instant: string): string {
  const moment = new Date(instant);
  const day = refundDate(instant).slice(0, DAY_AND_MONTH_LENGTH);
  const time = formatDate(moment, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: REFUND_TIME_ZONE,
  });
  return `${day} ${time}`;
}
