import { mayBeMovementQuantity } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { unitPriceTextSchema } from "./price-set.js";

const COMPONENTS_MESSAGE =
  "components must be component ids with a positive integer number of thousandths, as id:quantity separated by commas";

const componentIdSchema = recordIdSchema(COMPONENTS_MESSAGE);

const componentsSchema = z.string({ error: COMPONENTS_MESSAGE }).transform((text, context) => {
  const components = text.split(",").map((entry) => {
    const match = /^([^:]*):(\d+)$/.exec(entry);
    const id = componentIdSchema.safeParse(match?.[1]);
    const quantity = Number(match?.[2]);
    return id.success && mayBeMovementQuantity(quantity)
      ? { componentProductId: id.data, quantityPerOutputUnit: quantity }
      : null;
  });
  if (components.some((component) => component === null)) {
    context.addIssue({ code: "custom", message: COMPONENTS_MESSAGE });
    return z.NEVER;
  }
  return components.filter((component) => component !== null);
});

export const priceRecommendationQuerySchema = z.object({
  components: componentsSchema,
  unitPrice: unitPriceTextSchema.optional(),
});

export type PriceRecommendationQuery = z.input<typeof priceRecommendationQuerySchema>;

export const priceRecommendationSchema = z.object({
  currentPrice: z
    .object({
      id: z.string(),
      unitPrice: z.int(),
      validFrom: z.iso.datetime(),
    })
    .nullable(),
  recommendation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("recommended"), unitPrice: z.int() }),
    z.object({ kind: z.literal("missing_prices"), componentProductIds: z.array(z.string()) }),
  ]),
  batchCost: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("incomplete") }),
    z.object({
      kind: z.literal("known"),
      unitCostCents: z.int().nonnegative(),
      marginTenthsOfPercent: z.int().nullable(),
    }),
  ]),
});

export type PriceRecommendation = z.output<typeof priceRecommendationSchema>;
