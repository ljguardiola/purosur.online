import {
  type IssuedFiscalDocumentsQuery,
  issuedFiscalDocumentsQuerySchema,
} from "@purosur/contracts";
import { z } from "zod";
import {
  reportFiltersFields,
  reportQueryOf,
  withoutRefusedPeriod,
} from "../shell/report-filters-search";

const numberSchema = issuedFiscalDocumentsQuerySchema.shape.number;

export function isDocumentNumberText(text: string): boolean {
  return text === "" || numberSchema.safeParse(text).success;
}

export const issuedFiscalDocumentsFilters = z
  .object({
    ...reportFiltersFields,
    kind: z
      .union([z.literal("ALL"), issuedFiscalDocumentsQuerySchema.shape.kind.unwrap()])
      .default("ALL")
      .catch("ALL"),
    number: z.string().refine(isDocumentNumberText).default("").catch(""),
    page: z
      .preprocess(
        (page) => (typeof page === "number" ? String(page) : page),
        issuedFiscalDocumentsQuerySchema.shape.page.unwrap(),
      )
      .default(1)
      .catch(1),
  })
  .transform(withoutRefusedPeriod);

export type IssuedFiscalDocumentsFilters = z.output<typeof issuedFiscalDocumentsFilters>;

export function issuedFiscalDocumentsQueryOf(
  filters: IssuedFiscalDocumentsFilters,
): IssuedFiscalDocumentsQuery {
  const { register_id, from, to } = reportQueryOf(filters);
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(register_id === undefined ? {} : { register_id }),
    ...(filters.kind === "ALL" ? {} : { kind: filters.kind }),
    ...(filters.number === "" ? {} : { number: Number(filters.number) }),
    page: filters.page,
  };
}
