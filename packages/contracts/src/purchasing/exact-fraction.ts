import { z } from "zod";

export const exactFractionSchema = z.object({
  numerator: z.string().regex(/^\d+$/),
  denominator: z.string().regex(/^[1-9]\d*$/),
});

export type ExactFraction = z.output<typeof exactFractionSchema>;
