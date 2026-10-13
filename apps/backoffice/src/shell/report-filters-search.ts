import { recordIdSchema } from "@purosur/contracts";
import { z } from "zod";

const text = z.string().default("").catch("");

export const reportFiltersFields = {
  from: text,
  to: text,
  register: z
    .union([z.literal("ALL"), recordIdSchema()])
    .default("ALL")
    .catch("ALL"),
};

export type ReportFilters = { from: string; to: string; register: string };

export const reportFiltersSearch = z.object(reportFiltersFields);
