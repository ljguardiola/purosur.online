import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { voidCreditNoteSchema } from "./void-credit-note.js";

const issuedOn = z.string().refine(isCalendarDay);

export const returnCreditNoteSchema = z.union([
  voidCreditNoteSchema.extend({ issued_on: issuedOn }),
  voidCreditNoteSchema.extend({
    receiver_tax_status_code: z.null(),
    corrects: z.null(),
    issued_on: issuedOn,
  }),
]);
