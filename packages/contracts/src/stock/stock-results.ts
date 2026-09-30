import { z } from "zod";

export const stockMovementResultSchema = z.object({ balance: z.int(), superseded: z.boolean() });

export type StockMovementResult = z.output<typeof stockMovementResultSchema>;

export const stockCountResultSchema = stockMovementResultSchema.extend({
  expected: z.int(),
  delta: z.int(),
});

export type StockCountResult = z.output<typeof stockCountResultSchema>;
