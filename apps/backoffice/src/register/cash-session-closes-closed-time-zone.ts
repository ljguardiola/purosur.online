import { cashSessionClosesSchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";

export const CLOSED_TIME_ZONE = schemaText(
  cashSessionClosesSchema.shape.sessions.element.shape.closed_at.meta()?.["timeZone"],
);
