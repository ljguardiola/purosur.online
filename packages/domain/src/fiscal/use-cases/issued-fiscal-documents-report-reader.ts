import type { ReportPeriod } from "../../shared/index.js";
import type { IssuedDocumentGroup } from "../model/issued-fiscal-documents-report.js";

export interface IssuedFiscalDocumentsReportQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface IssuedFiscalDocumentsReportReader {
  issuedGroups(query: IssuedFiscalDocumentsReportQuery): Promise<IssuedDocumentGroup[]>;
}
