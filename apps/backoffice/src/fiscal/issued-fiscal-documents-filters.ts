import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export const issuedFiscalDocumentsFilters = z
  .object({
    ...reportFiltersFields,
    kind: z.enum(["ALL", "receipt", "credit_note"]).default("ALL").catch("ALL"),
    number: z.string().default("").catch(""),
    page: z.coerce.number().int().positive().default(1).catch(1),
  })
  .transform(withoutRefusedPeriod);

export type IssuedFiscalDocumentsFilters = z.output<typeof issuedFiscalDocumentsFilters>;
