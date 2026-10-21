import { SALE_VOIDED_EVENT_TYPE } from "@purosur/domain";
import { z } from "zod";
import {
  authorizedVoidCreditNoteAnswerSchema,
  pointOfSaleNumberSchema,
  pushedEventSchema,
  recordIdSchema,
  rejectedVoidCreditNoteAnswerSchema,
  voidCreditNoteSchema,
} from "../shared/index.js";

export const saleVoidCreditNoteRequestSchema = z.object({
  credit_note_id: recordIdSchema(),
  point_of_sale: pointOfSaleNumberSchema,
  sale_event: pushedEventSchema,
});

export type SaleVoidCreditNoteRequestBody = z.output<typeof saleVoidCreditNoteRequestSchema>;

export const saleVoidedEventCreditNoteSchema = z.object({
  event_type: z.literal(SALE_VOIDED_EVENT_TYPE),
  schema_version: z.literal(3),
  aggregate_id: z.string().min(1),
  payload: z.object({ credit_note: voidCreditNoteSchema }),
});

export const saleVoidCreditNoteResponseSchema = z.discriminatedUnion("state", [
  authorizedVoidCreditNoteAnswerSchema,
  rejectedVoidCreditNoteAnswerSchema,
  z.object({ state: z.literal("IN_PROGRESS") }),
]);

export type SaleVoidCreditNoteResponseBody = z.output<typeof saleVoidCreditNoteResponseSchema>;
