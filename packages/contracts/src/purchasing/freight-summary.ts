import { z } from "zod";

export const freightMeansSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("carrier"), name: z.string() }),
  z.object({ kind: z.literal("own_trip") }),
]);

export const freightSchema = z.object({
  id: z.string(),
  date: z.string(),
  amountCents: z.int(),
  description: z.string(),
  means: freightMeansSchema,
  purchaseIds: z.array(z.string()),
  recordedAt: z.iso.datetime(),
});

export const freightSummarySchema = z.object({
  id: z.string(),
  date: z.string(),
  amountCents: z.int(),
  description: z.string(),
  means: freightMeansSchema,
  purchases: z.array(
    z.object({
      id: z.string(),
      purchasedOn: z.string(),
      supplier: z.object({ id: z.string(), name: z.string() }),
    }),
  ),
});

export const freightListSchema = z.object({
  items: z.array(freightSummarySchema),
  count: z.int().nonnegative(),
  totalCents: z.int().nonnegative(),
});

export type Freight = z.output<typeof freightSchema>;
export type FreightSummary = z.output<typeof freightSummarySchema>;
export type FreightList = z.output<typeof freightListSchema>;
