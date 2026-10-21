import { FACTURA_C_DOCUMENT_TYPE } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const CORRECTED_FIELDS = [
  "issued_on",
  "total",
  "buyer_document_type",
  "buyer_document_number",
  "buyer_tax_status_code",
] as const;

const documentCorrectionSchema = z.object({
  issued_on: z.string().optional(),
  total: z.number().int().optional(),
  buyer_document_type: z.number().int().optional(),
  buyer_document_number: z.number().int().optional(),
  buyer_tax_status_code: z.number().int().optional(),
});

const rejectedDocumentRemedySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report") }),
  z.object({ kind: z.literal("printed"), correction: documentCorrectionSchema }),
]);

export const rejectedDocumentRemedyBodySchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  fortnight_start: z.string(),
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE),
  number: z.number().int().positive(),
  remedy: rejectedDocumentRemedySchema,
});

export const rejectedDocumentRemedyResponseSchema = z.object({
  recorded_at: z.iso.datetime(),
  changes: z.array(
    z.object({
      field: z.enum(CORRECTED_FIELDS),
      before: z.union([z.string(), z.number()]),
      after: z.union([z.string(), z.number()]),
    }),
  ),
});

export type RejectedDocumentRemedyBody = z.input<typeof rejectedDocumentRemedyBodySchema>;
export type RejectedDocumentRemedyResponseBody = z.output<
  typeof rejectedDocumentRemedyResponseSchema
>;
