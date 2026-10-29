import { isReportPeriodAsked } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema, recordIdSchema } from "../shared/index.js";
import { reportMonthSchema } from "./report-month.js";

export const purchasesBySupplierQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type PurchasesBySupplierQuery = z.output<typeof purchasesBySupplierQuerySchema>;

const monthSchema = z.object({
  month: reportMonthSchema,
  purchases: z.int().min(1),
  amount: z.int().nonnegative(),
});

const supplierSchema = z.object({
  supplier_id: recordIdSchema(),
  name: z.string(),
  months: z.array(monthSchema),
  purchases: z.int().min(1),
  amount: z.int().nonnegative(),
});

export const purchasesBySupplierSchema = z.object({
  range: answeredRangeSchema,
  suppliers: z.array(supplierSchema),
  totals: z.object({
    suppliers: z.int().nonnegative(),
    purchases: z.int().nonnegative(),
    amount: z.int().nonnegative(),
  }),
});

export type PurchasesBySupplierBody = z.output<typeof purchasesBySupplierSchema>;
