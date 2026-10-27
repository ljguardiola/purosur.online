import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type CashSessionClosesSummary,
  cashSessionClosesSummary,
} from "../model/cash-session-closes.js";
import type { CashSessionClosesReportReader } from "./cash-session-closes-report-reader.js";

export interface ReadCashSessionClosesInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface CashSessionClosesReport extends CashSessionClosesSummary {
  range: ReportPeriod;
}

export async function readCashSessionCloses(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: CashSessionClosesReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId }: ReadCashSessionClosesInput,
): Promise<CashSessionClosesReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const closes = await reader.closedCashSessions({ locationId, range, registerId });
  return { range, ...cashSessionClosesSummary(closes) };
}
