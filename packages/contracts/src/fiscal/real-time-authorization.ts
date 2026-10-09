import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema, pushedEventSchema, recordIdSchema } from "../shared/index.js";

export const realTimeAuthorizationRequestSchema = z.object({
  fiscal_document_id: recordIdSchema(),
  sale_id: recordIdSchema(),
  point_of_sale: pointOfSaleNumberSchema,
  number: z.int().positive(),
  issued_on: z.string().refine(isCalendarDay),
  total: z.int().nonnegative(),
  buyer_tax_status_code: z.int(),
  timeout_ms: z.int().positive(),
  rtt_median_ms: z.int().nonnegative(),
  sale_event: pushedEventSchema,
});

export type RealTimeAuthorizationRequestBody = z.output<typeof realTimeAuthorizationRequestSchema>;

export const realTimeAuthorizationResponseSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("AUTHORIZED"),
    authorization_code: z.string().min(1),
    authorization_code_due_on: z.string().refine(isCalendarDay),
  }),
  z.object({ state: z.literal("REJECTED"), rejection_codes: z.array(z.int()) }),
  z.object({ state: z.literal("NOT_ATTEMPTED") }),
  z.object({ state: z.literal("UNCLEAR") }),
]);

export type RealTimeAuthorizationResponseBody = z.output<
  typeof realTimeAuthorizationResponseSchema
>;
