import { isReportPeriodAsked } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "./record-id.js";

export const reportQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    register_id: recordIdSchema().optional(),
  })
  .refine(({ from, to }) => isReportPeriodAsked({ from, to }));

export type ReportQuery = z.output<typeof reportQuerySchema>;
