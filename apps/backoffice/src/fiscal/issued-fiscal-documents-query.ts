import type { IssuedFiscalDocumentsQuery } from "@purosur/contracts";
import { reportQueryOf } from "../shell/report-filters-search";
import type { IssuedFiscalDocumentsFilters } from "./issued-fiscal-documents-filters";

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
