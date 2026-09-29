import { z } from "zod";

export const brandSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  version: z.int(),
  productCount: z.int().nonnegative(),
});

export const brandListSchema = z.array(brandSummarySchema);

export type BrandSummary = z.output<typeof brandSummarySchema>;
