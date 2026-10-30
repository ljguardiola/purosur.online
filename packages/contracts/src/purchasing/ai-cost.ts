import { z } from "zod";

const aiCostTotalSchema = z.object({
  costNanoUsd: z.int().nonnegative(),
  unpricedCalls: z.int().nonnegative(),
});

export const aiCostSchema = z.object({
  reading: aiCostTotalSchema,
  proposals: aiCostTotalSchema,
  total: aiCostTotalSchema,
});

export type AiCostBody = z.output<typeof aiCostSchema>;
