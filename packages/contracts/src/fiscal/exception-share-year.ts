import { CONTINGENCY_TIME_MONTH_STATES, EXCEPTION_SHARE_MONTH_STATES } from "@purosur/domain";
import { z } from "zod";

const count = z.int().nonnegative();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const exceptionShareYearQuerySchema = z.object({
  year: z
    .string()
    .regex(/^[1-9]\d{3}$/)
    .transform(Number)
    .optional(),
});

export const exceptionShareYearSchema = z.object({
  fiscal_address: z.object({ id: z.string(), name: z.string() }),
  year: z.int(),
  selectable_years: z.tuple([z.int()], z.int()),
  non_compliance_percent: z.int(),
  months: z.array(
    z.object({
      month,
      exception_count: count,
      total_count: count,
      share_tenths_of_percent: z.int().nullable(),
      state: z.enum(EXCEPTION_SHARE_MONTH_STATES),
      contingency_time: z.object({
        contingency_ms: count,
        available_ms: count,
        share_tenths_of_percent: z.int().nullable(),
        state: z.enum(CONTINGENCY_TIME_MONTH_STATES),
      }),
    }),
  ),
  non_compliant_months: z.array(month),
  contingency_non_compliance_percent: z.int(),
  contingency_non_compliant_months: z.array(month),
});

export type ExceptionShareYearQuery = z.output<typeof exceptionShareYearQuerySchema>;
export type ExceptionShareYearBody = z.output<typeof exceptionShareYearSchema>;
