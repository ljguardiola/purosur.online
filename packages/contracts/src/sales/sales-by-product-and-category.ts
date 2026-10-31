import { z } from "zod";
import {
  answeredRangeSchema,
  netContentSchema,
  recordIdSchema,
  reportQuerySchema,
  salesReportGroupSchema,
} from "../shared/index.js";

const count = z.int().nonnegative();
const cents = z.int().nonnegative();

export const salesByProductAndCategoryQuerySchema = reportQuerySchema.and(
  z.object({ group: salesReportGroupSchema }),
);

export const salesByProductAndCategorySchema = z.object({
  range: answeredRangeSchema,
  group: salesReportGroupSchema,
  rows: z.array(
    z.object({
      id: recordIdSchema().nullable(),
      path: z.array(z.string()),
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      units: count,
      thousandths: count,
      amount: cents,
    }),
  ),
  totals: z.object({ units: count, thousandths: count, amount: cents }),
});

export type SalesByProductAndCategoryQuery = z.output<typeof salesByProductAndCategoryQuerySchema>;
export type SalesByProductAndCategoryBody = z.output<typeof salesByProductAndCategorySchema>;
