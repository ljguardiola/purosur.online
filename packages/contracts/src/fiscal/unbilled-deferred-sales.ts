import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";

export const unbilledDeferredSalesSchema = z.object({
  count: z.int().nonnegative(),
  oldest: z
    .object({
      occurred_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
      age_days: z.int().nonnegative(),
    })
    .nullable(),
});

export type UnbilledDeferredSales = z.output<typeof unbilledDeferredSalesSchema>;
