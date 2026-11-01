import { handConfirmedPaymentsSchema } from "@purosur/contracts";
import { schemaText } from "../platform/schema-text";

export const CONFIRMED_TIME_ZONE = schemaText(
  handConfirmedPaymentsSchema.shape.payments.element.shape.confirmed_at.meta()?.["timeZone"],
);
