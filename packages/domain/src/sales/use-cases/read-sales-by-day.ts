import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type SalesOfDay,
  type SalesReportTotals,
  salesReportTotals,
} from "../model/sales-report.js";
import type { SalesReportReader } from "./sales-report-reader.js";

export interface ReadSalesByDayInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface SalesByDayReport {
  range: ReportPeriod;
  days: SalesOfDay[];
  totals: SalesReportTotals;
}

export async function readSalesByDay(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: SalesReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId }: ReadSalesByDayInput,
): Promise<SalesByDayReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const days = await reader.completedSalesByDay({ locationId, range, registerId });
  return { range, days, totals: salesReportTotals(days) };
}
