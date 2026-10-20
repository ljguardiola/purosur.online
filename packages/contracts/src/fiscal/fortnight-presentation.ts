import {
  FACTURA_C_DOCUMENT_TYPE,
  type FortnightPresentationRefusal,
  type FortnightPresentationState,
  type FortnightReportMovement,
} from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const fortnightPresentationStateSchema: z.ZodType<FortnightPresentationState> = z.enum([
  "blocked",
  "missing_document",
  "submitting",
  "refused",
  "accepted",
  "needs_regularization",
  "listed_as_owed",
]);

const fortnightReportMovementSchema: z.ZodType<FortnightReportMovement> = z.enum([
  "none",
  "documents",
]);

const fortnightPresentationRefusalSchema: z.ZodType<FortnightPresentationRefusal> = z.enum([
  "partial",
  "whole",
]);

export const fortnightPresentationSchema = z.object({
  register_id: z.string(),
  point_of_sale_number: pointOfSaleNumberSchema,
  fortnight_start: z.string(),
  fortnight_end: z.string(),
  deadline: z.string(),
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE).nullable(),
  document_count: z.number().int().nonnegative(),
  rejected_document: z
    .object({ number: z.number().int().positive(), unprocessed: z.number().int().nonnegative() })
    .nullable(),
  movement: fortnightReportMovementSchema.nullable(),
  refusal: fortnightPresentationRefusalSchema.nullable(),
  state: fortnightPresentationStateSchema.nullable(),
});

export const fortnightPresentationListSchema = z.array(fortnightPresentationSchema);

export type FortnightPresentationBody = z.output<typeof fortnightPresentationSchema>;
