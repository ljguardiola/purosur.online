import { returnsReportSchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";

export const OCCURRED_TIME_ZONE = schemaText(
  returnsReportSchema.shape.typed.shape.rows.element.shape.occurred_at.meta()?.["timeZone"],
);
