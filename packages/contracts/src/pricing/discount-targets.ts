import { DISCOUNT_BENEFIT_KINDS, DISCOUNT_TARGET_KINDS, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

const targetSchema = z.object({
  id: z.string(),
  name: z.string(),
  benefitKinds: z.array(z.enum(DISCOUNT_BENEFIT_KINDS)),
});

export const discountTargetsSchema = z.object({
  products: z.array(
    targetSchema.extend({
      saleUnit: z.enum(SALE_UNITS),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      barcodes: z.array(z.string()),
    }),
  ),
  categories: z.array(targetSchema.extend({ parentId: z.string().nullable() })),
  tags: z.array(targetSchema),
  targetKindsByBenefit: z.record(
    z.enum(DISCOUNT_BENEFIT_KINDS),
    z.array(z.enum(DISCOUNT_TARGET_KINDS)),
  ),
});

export type DiscountTargets = z.output<typeof discountTargetsSchema>;
