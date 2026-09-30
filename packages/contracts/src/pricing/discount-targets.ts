import { z } from "zod";

const namedTargetSchema = z.object({ id: z.string(), name: z.string() });

export const discountTargetsSchema = z.object({
  products: z.array(namedTargetSchema),
  categories: z.array(namedTargetSchema.extend({ parentId: z.string().nullable() })),
  tags: z.array(namedTargetSchema),
});

export type DiscountTargets = z.output<typeof discountTargetsSchema>;
