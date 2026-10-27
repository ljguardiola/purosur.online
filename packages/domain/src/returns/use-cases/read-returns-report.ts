import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
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
  {
    reader,
    clock,
    zoneRules,
  }: { reader: ReturnsReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId }: ReadReturnsReportInput,
): Promise<ReturnsReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const records = await reader.returnsMade({ locationId, range, registerId });
  return { range, ...returnsReportGroups(records) };
}
