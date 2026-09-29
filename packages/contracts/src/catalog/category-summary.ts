import { z } from "zod";

export const categorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.int(),
  parentId: z.string().nullable(),
});

export const categoryListSchema = z.array(categorySummarySchema);

export type CategorySummary = z.output<typeof categorySummarySchema>;
