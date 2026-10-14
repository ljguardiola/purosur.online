import { isWellFormedRegisterVersion } from "@purosur/domain";
import { z } from "zod";

export const registersBelowMinimumQuerySchema = z.object({
  minimum: z.string().refine(isWellFormedRegisterVersion),
});

export const registersBelowMinimumSchema = z.object({
  registers: z.array(
    z.object({
      register_name: z.string(),
      app_version: z.string().nullable(),
    }),
  ),
});

export type RegistersBelowMinimumQuery = z.input<typeof registersBelowMinimumQuerySchema>;
export type RegistersBelowMinimum = z.output<typeof registersBelowMinimumSchema>;
