import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type IssuedDocumentsReportRow,
  type IssuedDocumentsReportTotals,
  issuedFiscalDocumentsReport,
} from "../model/issued-fiscal-documents-report.js";
import type { IssuedFiscalDocumentsReportReader } from "./issued-fiscal-documents-report-reader.js";

export interface ReadIssuedFiscalDocumentsReportInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface IssuedFiscalDocumentsReport {
  range: ReportPeriod;
  rows: IssuedDocumentsReportRow[];
  totals: IssuedDocumentsReportTotals;
}

export async function readIssuedFiscalDocumentsReport(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: IssuedFiscalDocumentsReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId }: ReadIssuedFiscalDocumentsReportInput,
): Promise<IssuedFiscalDocumentsReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const groups = await reader.issuedGroups({ locationId, range, registerId });
  return { range, ...issuedFiscalDocumentsReport(groups) };
}
