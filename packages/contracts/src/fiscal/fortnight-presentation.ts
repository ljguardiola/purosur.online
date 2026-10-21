import {
  FACTURA_C_DOCUMENT_TYPE,
  type FortnightPresentationRefusal,
  type FortnightPresentationState,
  type FortnightReportMovement,
  type RejectedDocumentRemedyState,
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

const rejectedDocumentRemedyStateSchema: z.ZodType<RejectedDocumentRemedyState> = z.enum([
  "awaiting_remedy",
  "awaiting_resend",
]);

const rejectedDocumentSchema = z.object({
  number: z.number().int().positive(),
  unprocessed: z.number().int().nonnegative(),
  document_id: z.string(),
  issued_on: z.string(),
  total: z.number().int(),
  buyer_document_type: z.number().int(),
  buyer_document_number: z.number().int(),
  buyer_tax_status_code: z.number().int(),
  rejections: z.array(z.object({ code: z.number().int(), message: z.string() })),
  remedy: rejectedDocumentRemedyStateSchema,
});

export const fortnightPresentationSchema = z.object({
  register_id: z.string(),
  point_of_sale_number: pointOfSaleNumberSchema,
  fortnight_start: z.string(),
  fortnight_end: z.string(),
  deadline: z.string(),
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE).nullable(),
  document_count: z.number().int().nonnegative(),
  rejected_document: rejectedDocumentSchema.nullable(),
  movement: fortnightReportMovementSchema.nullable(),
  refusal: fortnightPresentationRefusalSchema.nullable(),
  state: fortnightPresentationStateSchema.nullable(),
});

export const fortnightPresentationListSchema = z.array(fortnightPresentationSchema);

export type FortnightPresentationBody = z.output<typeof fortnightPresentationSchema>;
