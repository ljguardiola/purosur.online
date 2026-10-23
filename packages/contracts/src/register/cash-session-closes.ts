import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema, recordIdSchema } from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int().nonnegative();
const personId = z.string().min(1);

export const cashSessionClosesSchema = z.object({
  range: answeredRangeSchema,
  totals: z.object({
    sessions: count,
    net_difference: z.int(),
    with_difference: count,
    cashiers: z.array(
      z.object({
        cashier_id: personId,
        cashier_name: z.string().nullable(),
        sessions: z.int().positive(),
      }),
    ),
  }),
  sessions: z.array(
    z.object({
      id: recordIdSchema(),
      closed_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
      register_id: recordIdSchema(),
      register_name: z.string(),
      cashier_id: personId,
      cashier_name: z.string().nullable(),
      closed_by_id: personId,
      closed_by_name: z.string().nullable(),
      expected_cash: cents,
      counted_cash: cents,
      difference: z.int(),
      has_difference: z.boolean(),
    }),
  ),
});

export type CashSessionClosesBody = z.output<typeof cashSessionClosesSchema>;
