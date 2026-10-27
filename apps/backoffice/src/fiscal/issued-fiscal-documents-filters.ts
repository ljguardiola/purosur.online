import { issuedFiscalDocumentsQueryNumberSchema } from "@purosur/contracts";
import { z } from "zod";
import { reportFiltersFields, withoutRefusedPeriod } from "../shell/report-filters-search";

export function isDocumentNumberText(text: string): boolean {
  return text === "" || issuedFiscalDocumentsQueryNumberSchema.safeParse(text).success;
}

export const issuedFiscalDocumentsFilters = z
  .object({
    ...reportFiltersFields,
    kind: z.enum(["ALL", "receipt", "credit_note"]).default("ALL").catch("ALL"),
    number: z.string().refine(isDocumentNumberText).default("").catch(""),
    page: z
      .preprocess(
        (page) => (typeof page === "number" ? String(page) : page),
        issuedFiscalDocumentsQueryNumberSchema,
      )
      .default(1)
      .catch(1),
  })
  .transform(withoutRefusedPeriod);

export type IssuedFiscalDocumentsFilters = z.output<typeof issuedFiscalDocumentsFilters>;
