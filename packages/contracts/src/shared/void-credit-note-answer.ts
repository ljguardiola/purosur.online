import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "./point-of-sale-number.js";

export const authorizedVoidCreditNoteAnswerSchema = z.object({
  state: z.literal("AUTHORIZED"),
  point_of_sale: pointOfSaleNumberSchema,
  number: z.int().positive(),
  issued_on: z.string().refine(isCalendarDay),
  issued_at: z.iso.datetime(),
  authorization_code: z.string().min(1),
  authorization_code_due_on: z.string().refine(isCalendarDay),
});

export const rejectedVoidCreditNoteAnswerSchema = z.object({ state: z.literal("REJECTED") });
