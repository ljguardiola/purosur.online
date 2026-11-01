import { EXCEPTION_SHARE_MONTH_STATES } from "@purosur/domain";
import { z } from "zod";

const count = z.int().nonnegative();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const exceptionShareYearQuerySchema = z.object({
  year: z
    .string()
    .regex(/^[1-9]\d{3}$/)
    .transform(Number),
});

export const exceptionShareYearSchema = z.object({
  fiscal_address: z.object({ id: z.string(), name: z.string() }),
  year: z.int(),
  months: z.array(
    z.object({
      month,
      exception_count: count,
      total_count: count,
      share_tenths_of_percent: z.int().nullable(),
      state: z.enum(EXCEPTION_SHARE_MONTH_STATES),
    }),
  ),
  non_compliant_months: z.array(month),
});

export type ExceptionShareYearQuery = z.output<typeof exceptionShareYearQuerySchema>;
export type ExceptionShareYearBody = z.output<typeof exceptionShareYearSchema>;
