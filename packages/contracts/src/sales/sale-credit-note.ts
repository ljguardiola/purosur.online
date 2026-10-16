import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

export const saleCreditNoteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("authorized"),
    point_of_sale: pointOfSaleNumberSchema,
    number: z.int().positive(),
    issued_on: z.string().refine(isCalendarDay),
    authorization_code: z.string().min(1),
    authorization_code_due_on: z.string().refine(isCalendarDay),
  }),
  z.object({ kind: z.literal("rejected") }),
  z.object({ kind: z.literal("in_progress") }),
]);
export type SaleCreditNote = z.infer<typeof saleCreditNoteSchema>;
