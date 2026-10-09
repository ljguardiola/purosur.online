import { z } from "zod";

const cents = z.int().nonnegative();

export const reachesThresholdRefusalSchema = z.object({
  kind: z.literal("reaches_buyer_identification_threshold"),
  threshold: z.int().positive(),
});

export const noThresholdRefusalSchema = z.object({
  kind: z.literal("no_buyer_identification_threshold"),
});

export const partiallyPaidOutcomeSchema = z.object({
  kind: z.literal("partially_paid"),
  sale_id: z.string(),
  total: cents,
  paid: cents,
  pending: cents,
});
