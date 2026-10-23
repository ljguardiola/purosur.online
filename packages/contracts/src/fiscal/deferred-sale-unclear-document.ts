import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const deferredSaleUnclearDocumentEventSchema = z.object({
  event_type: z.literal("deferred_sale_recorded"),
  schema_version: z.literal(2),
  payload: z.object({
    unclear_document: z.object({ fiscal_document_id: recordIdSchema() }),
  }),
});
