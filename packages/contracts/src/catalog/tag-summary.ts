import { z } from "zod";

export const tagSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  version: z.int(),
  productCount: z.int().nonnegative(),
});

export const tagListSchema = z.object({
  tags: z.array(tagSummarySchema),
  taggedProductCount: z.int().nonnegative(),
});

export type TagSummary = z.output<typeof tagSummarySchema>;
export type TagList = z.output<typeof tagListSchema>;
