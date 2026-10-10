import { type CalendarDate, fromDate, toCalendarDate } from "@internationalized/date";
import { purchaseRegistrationBodySchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";

const PURCHASE_TIME_ZONE = schemaText(
  purchaseRegistrationBodySchema.shape.purchasedOn.meta()?.["timeZone"],
);

export function purchaseDayOf(now: Date): CalendarDate {
  return toCalendarDate(fromDate(now, PURCHASE_TIME_ZONE));
}
