import {
  type IssuedFiscalDocumentsQuery,
  issuedFiscalDocumentsQuerySchema,
} from "@purosur/contracts";
import { reportQueryOf } from "../shell/report-filters-search";
import type { IssuedFiscalDocumentsFilters } from "./issued-fiscal-documents-filters";

const numberSchema = issuedFiscalDocumentsQuerySchema.shape.number;

export function isDocumentNumberText(text: string): boolean {
  return text === "" || numberSchema.safeParse(text).success;
}

export function issuedFiscalDocumentsQueryOf(
  filters: IssuedFiscalDocumentsFilters,
): IssuedFiscalDocumentsQuery {
  const { register_id, from, to } = reportQueryOf(filters);
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(register_id === undefined ? {} : { register_id }),
    ...(filters.kind === "ALL" ? {} : { kind: filters.kind }),
    ...(filters.number === "" || !isDocumentNumberText(filters.number)
      ? {}
      : { number: Number(filters.number) }),
    page: filters.page,
  };
}
