import { isCalendarDay, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const currentStockReportQuerySchema = z.object({
  category_id: recordIdSchema().optional(),
});

export type CurrentStockReportQuery = z.output<typeof currentStockReportQuerySchema>;

const currentStockLotSchema = z.object({
  id: z.string(),
  lot_number: z.string().nullable(),
  expires_on: z.string().refine(isCalendarDay).nullable(),
  technical: z.boolean(),
  remaining: z.int(),
  unit_cost_cents: z.int().nullable(),
  value_cents: z.int().nullable(),
});

const currentStockProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  category_id: z.string(),
  category_name: z.string(),
  sale_unit: z.enum(SALE_UNITS),
  balance: z.int(),
  value_cents: z.int().nullable(),
  lots: z.array(currentStockLotSchema),
});

export const currentStockReportSchema = z.object({
  products: z.array(currentStockProductSchema),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  summary: z.object({
    value_cents: z.int(),
    product_count: z.int(),
    negative_balance_count: z.int(),
    without_cost_count: z.int(),
  }),
});

export type CurrentStockReportBody = z.output<typeof currentStockReportSchema>;
