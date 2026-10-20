import { isCalendarDay, SALE_VOIDED_EVENT_TYPE } from "@purosur/domain";
import { z } from "zod";
import {
  pointOfSaleNumberSchema,
  pushedEventSchema,
  recordIdSchema,
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
  z.object({
    state: z.literal("AUTHORIZED"),
    point_of_sale: pointOfSaleNumberSchema,
    number: z.int().positive(),
    issued_on: z.string().refine(isCalendarDay),
    issued_at: z.iso.datetime(),
    authorization_code: z.string().min(1),
    authorization_code_due_on: z.string().refine(isCalendarDay),
  }),
  z.object({ state: z.literal("REJECTED") }),
  z.object({ state: z.literal("IN_PROGRESS") }),
]);

export type SaleVoidCreditNoteResponseBody = z.output<typeof saleVoidCreditNoteResponseSchema>;
