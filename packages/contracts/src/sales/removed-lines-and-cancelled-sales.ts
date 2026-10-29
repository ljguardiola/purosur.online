import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

const count = z.int().nonnegative();

const removed = z.object({
  lines: count,
  units: count,
  thousandths: count,
  amount: count,
});

const cancelled = z.object({
  sales: count,
  units: count,
  thousandths: count,
  amount: count,
});

export const removedLinesAndCancelledSalesSchema = z.object({
  range: answeredRangeSchema,
  cashiers: z.array(
    z.object({
      cashier_id: z.string().min(1),
      name: z.string().nullable(),
      removed,
      cancelled,
    }),
  ),
  sessions: z.array(
    z.object({
      session_id: z.string().min(1),
      register_name: z.string().min(1),
      opened_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
      removed,
      cancelled,
    }),
  ),
  totals: z.object({ removed, cancelled }),
});

export type RemovedLinesAndCancelledSalesBody = z.output<
  typeof removedLinesAndCancelledSalesSchema
>;
