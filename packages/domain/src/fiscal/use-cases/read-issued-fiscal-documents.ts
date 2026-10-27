import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE,
  type IssuedDocumentKind,
} from "../model/issued-fiscal-document.js";
import type {
  IssuedFiscalDocument,
  IssuedFiscalDocumentsReader,
} from "./issued-fiscal-documents-reader.js";

export interface ReadIssuedFiscalDocumentsInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
  kind: IssuedDocumentKind | undefined;
  number: number | undefined;
  page: number;
}

export interface IssuedFiscalDocumentsListing {
  range: ReportPeriod;
  documents: IssuedFiscalDocument[];
  total: number;
  pageSize: number;
}

export async function readIssuedFiscalDocuments(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: IssuedFiscalDocumentsReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId, kind, number, page }: ReadIssuedFiscalDocumentsInput,
): Promise<IssuedFiscalDocumentsListing> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const { documents, total } = await reader.issuedInPeriod({
    locationId,
    range,
    registerId,
    kind,
    number,
    page: { number: page, size: ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE },
  });
  return { range, documents, total, pageSize: ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE };
}
