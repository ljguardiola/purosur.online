import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type CashRoundingRecord,
  type CashRoundingTotals,
  cashRoundingRows,
  cashRoundingTotals,
} from "../model/cash-rounding-report.js";
import type { CashRoundingReportReader } from "./cash-rounding-report-reader.js";

export interface ReadCashRoundingInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface CashRoundingReport {
  range: ReportPeriod;
  rows: CashRoundingRecord[];
  totals: CashRoundingTotals;
}

export async function readCashRounding(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: CashRoundingReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId }: ReadCashRoundingInput,
): Promise<CashRoundingReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const records = await reader.completedCashRoundings({ locationId, range, registerId });
  const rows = cashRoundingRows(records);
  return { range, rows, totals: cashRoundingTotals(rows) };
}
