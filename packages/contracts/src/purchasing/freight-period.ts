import { DEFAULT_FREIGHT_PERIOD_DAYS, FREIGHT_PERIOD_DAYS } from "@purosur/domain";
import { z } from "zod";

export const freightPeriodDaysSchema = z.literal(FREIGHT_PERIOD_DAYS);

export const freightPeriodSchema = z.coerce
  .number()
  .pipe(freightPeriodDaysSchema)
  .default(DEFAULT_FREIGHT_PERIOD_DAYS);

export type FreightPeriod = z.output<typeof freightPeriodSchema>;
