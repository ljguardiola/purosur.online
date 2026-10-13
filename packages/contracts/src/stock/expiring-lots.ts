import { isCalendarDay, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { stockMovementResultSchema } from "./stock-results.js";

const expiringLotSchema = z.object({
  id: z.string(),
  lotNumber: z.string().nullable(),
  expiresOn: z.string().refine(isCalendarDay),
  remaining: z.int(),
  valueCents: z.int().nullable(),
  expired: z.boolean(),
  daysToExpiry: z.int(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    categoryId: z.string(),
    categoryName: z.string(),
    saleUnit: z.enum(SALE_UNITS),
  }),
});

export const expiringLotListSchema = z.object({
  windowDays: z.int(),
  lots: z.array(expiringLotSchema),
  summary: z.object({ valueCents: z.int(), withoutCostCount: z.int() }),
});

export type ExpiringLot = z.output<typeof expiringLotSchema>;
export type ExpiringLotList = z.output<typeof expiringLotListSchema>;

export const expiredLotDiscardResultSchema = stockMovementResultSchema.extend({
  movementId: z.string(),
  quantity: z.int(),
});

export type ExpiredLotDiscardResult = z.output<typeof expiredLotDiscardResultSchema>;
