import { type Clock, type ReportPeriod, reportPeriodOf } from "../../shared/index.js";
import { type ReturnsGroup, returnsReportGroups } from "../model/returns-report.js";
import type { ReturnsReportReader } from "./returns-report-reader.js";

export interface ReadReturnsReportInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface ReturnsReport {
  range: ReportPeriod;
  typed: ReturnsGroup;
  scanned: ReturnsGroup;
}

export async function readReturnsReport(
  { reader, clock }: { reader: ReturnsReportReader; clock: Clock },
  { locationId, asked, registerId }: ReadReturnsReportInput,
): Promise<ReturnsReport> {
  const range = reportPeriodOf(asked, clock.now());
  const records = await reader.returnsMade({ locationId, range, registerId });
  return { range, ...returnsReportGroups(records) };
}
