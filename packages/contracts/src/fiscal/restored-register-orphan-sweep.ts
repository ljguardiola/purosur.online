import { z } from "zod";

const numbersSchema = z.array(z.int().positive());

export const restoredRegisterOrphanSweepResponseSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("SWEPT"),
    credit_noted_numbers: numbersSchema,
    alerted_numbers: numbersSchema,
  }),
  z.object({ state: z.literal("NUMBERING_NOT_RECONCILED") }),
]);

export type RestoredRegisterOrphanSweepResponseBody = z.output<
  typeof restoredRegisterOrphanSweepResponseSchema
>;
