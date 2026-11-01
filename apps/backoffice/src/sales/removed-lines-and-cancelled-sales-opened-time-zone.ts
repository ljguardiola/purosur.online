import { removedLinesAndCancelledSalesSchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";

export const OPENED_TIME_ZONE = schemaText(
  removedLinesAndCancelledSalesSchema.shape.sessions.element.shape.opened_at.meta()?.["timeZone"],
);
