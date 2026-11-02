import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type AuthorizerReturnsAndVoids,
  type CashierReturnsAndVoids,
  type ReturnsGroup,
  type ReturnsReportTotals,
  returnsReportGroups,
  returnsReportTotals,
  type VoidsGroup,
  voidedSalesGroup,
  voidsAndReturnsByAuthorizer,
  voidsAndReturnsByCashier,
} from "../model/returns-report.js";
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
  voids: VoidsGroup;
  totals: ReturnsReportTotals;
  byCashier: CashierReturnsAndVoids[];
  byAuthorizer: AuthorizerReturnsAndVoids[];
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
  const { returns: records, voids: voided } = await reader.returnsAndVoidsMade({
    locationId,
    range,
    registerId,
  });
  return {
    range,
    ...returnsReportGroups(records),
    voids: voidedSalesGroup(voided),
    totals: returnsReportTotals(records, voided),
    byCashier: voidsAndReturnsByCashier(records, voided),
    byAuthorizer: voidsAndReturnsByAuthorizer(records, voided),
  };
}
