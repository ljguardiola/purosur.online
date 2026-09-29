import { z } from "zod";

export const tagSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  version: z.int(),
  productCount: z.int().nonnegative(),
});

export const tagListSchema = z.array(tagSummarySchema);

export type TagSummary = z.output<typeof tagSummarySchema>;
