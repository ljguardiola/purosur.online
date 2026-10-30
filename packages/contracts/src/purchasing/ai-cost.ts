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

export const supplierPriceListAiCostSchema = aiCostSchema.extend({
  recordedFromStart: z.boolean(),
});

export type SupplierPriceListAiCostBody = z.output<typeof supplierPriceListAiCostSchema>;
