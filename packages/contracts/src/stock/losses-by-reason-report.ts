import { isReportPeriodAsked, RECORDED_LOSS_REASONS, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";

export const lossesByReasonReportQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type LossesByReasonReportQuery = z.output<typeof lossesByReasonReportQuerySchema>;

const lostProductSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  sale_unit: z.enum(SALE_UNITS),
  quantity: z.int().positive(),
  loss_count: z.int().min(1),
});

const reasonLossesSchema = z.object({
  reason: z.enum(RECORDED_LOSS_REASONS),
  loss_count: z.int().min(1),
  products: z.array(lostProductSchema),
});

export const lossesByReasonReportSchema = z.object({
  range: answeredRangeSchema,
  reasons: z.array(reasonLossesSchema),
});

export type LossesByReasonReportBody = z.output<typeof lossesByReasonReportSchema>;
