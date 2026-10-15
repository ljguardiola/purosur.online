import { FACTURA_C_DOCUMENT_TYPE, type FortnightReportState } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const fortnightReportStateSchema: z.ZodType<FortnightReportState> = z.enum([
  "blocked",
  "submitting",
  "refused",
  "accepted",
  "needs_regularization",
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
  state: fortnightReportStateSchema.nullable(),
});

export const fortnightPresentationListSchema = z.array(fortnightPresentationSchema);

export type FortnightPresentationBody = z.output<typeof fortnightPresentationSchema>;
