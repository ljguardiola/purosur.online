import { AI_COST_GROUPINGS, isReportPeriodAsked } from "@purosur/domain";
import { z } from "zod";
import { answeredRangeSchema } from "../shared/index.js";
import { aiCostSchema } from "./ai-cost.js";

export const aiCostByPeriodQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    group_by: z.enum(AI_COST_GROUPINGS),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type AiCostByPeriodQuery = z.output<typeof aiCostByPeriodQuerySchema>;

export const aiCostByPeriodSchema = z.object({
  range: answeredRangeSchema,
  groups: z.array(
    z.object({
      key: z.string(),
      name: z.string().nullable(),
      ...aiCostSchema.shape,
    }),
  ),
  total: aiCostSchema,
});

export type AiCostByPeriodBody = z.output<typeof aiCostByPeriodSchema>;
