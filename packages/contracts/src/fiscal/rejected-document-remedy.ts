import {
  type CorrectedBuyer,
  FACTURA_C_DOCUMENT_TYPE,
  isCalendarDay,
  type OfflineDocumentBuyer,
} from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const calendarDaySchema = z.string().refine(isCalendarDay);

const finalConsumerSchema = z.object({ kind: z.literal("final_consumer") });

const buyerWithCuitSchema = z.object({ kind: z.literal("cuit"), number: z.number().int() });

const correctedBuyerSchema: z.ZodType<CorrectedBuyer, CorrectedBuyer> = z.discriminatedUnion(
  "kind",
  [finalConsumerSchema, buyerWithCuitSchema],
);

export const offlineDocumentBuyerSchema: z.ZodType<OfflineDocumentBuyer, OfflineDocumentBuyer> =
  z.discriminatedUnion("kind", [
    finalConsumerSchema,
    buyerWithCuitSchema,
    z.object({ kind: z.literal("other") }),
  ]);

const documentCorrectionSchema = z.object({
  issued_on: calendarDaySchema.optional(),
  total: z.number().int().optional(),
  buyer: correctedBuyerSchema.optional(),
  buyer_tax_status_code: z.number().int().optional(),
});

const rejectedDocumentRemedySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report") }),
  z.object({ kind: z.literal("printed"), correction: documentCorrectionSchema }),
]);

export const rejectedDocumentRemedyBodySchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  fortnight_start: calendarDaySchema,
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE),
  number: z.number().int().positive(),
  remedy: rejectedDocumentRemedySchema,
});

export type RejectedDocumentRemedyBody = z.input<typeof rejectedDocumentRemedyBodySchema>;
