import { z } from "zod";

export const deferredSaleUnclearDocumentEventSchema = z.object({
  event_type: z.literal("deferred_sale_recorded"),
  schema_version: z.literal(2),
  payload: z.object({
    unclear_document: z.object({ fiscal_document_id: z.string().min(1) }),
  }),
});
