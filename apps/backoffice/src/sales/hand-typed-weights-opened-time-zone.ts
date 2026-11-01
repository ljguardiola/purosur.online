import { handTypedWeightsSchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";

export const OPENED_TIME_ZONE = schemaText(
  handTypedWeightsSchema.shape.sessions.element.shape.opened_at.meta()?.["timeZone"],
);
