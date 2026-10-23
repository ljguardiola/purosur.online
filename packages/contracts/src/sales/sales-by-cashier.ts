import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByCashierSchema = z.object({
  range: answeredRangeSchema,
  rows: z.array(
    z.object({
      cashier_id: z.string().min(1),
      name: z.string().nullable(),
      sessions: count,
      sales_count: count,
      total: cents,
      average_ticket: cents.nullable(),
    }),
  ),
  totals: z.object({
    cashiers: count,
    sales_count: count,
    total: cents,
    average_ticket: cents.nullable(),
  }),
});

export type SalesByCashierBody = z.output<typeof salesByCashierSchema>;
