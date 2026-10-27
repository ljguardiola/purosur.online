import { compromiseResponseSchema } from "@purosur/contracts";
import { formatDayAndTime } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const DONE_AT_TIME_ZONE = schemaText(
  compromiseResponseSchema.shape.steps.element.shape.done_at.meta()?.["timeZone"],
);

export function compromiseResponseDoneMoment(instant: string): string {
  return formatDayAndTime(instant, DONE_AT_TIME_ZONE);
}
