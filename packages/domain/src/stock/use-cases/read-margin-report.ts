import type { SalesReportGroup } from "../../sales/index.js";
import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import { type MarginOfGroup, type MarginTotals, marginReport } from "../model/margin-report.js";
import type { SaleMarginReportReader } from "./sale-margin-report-reader.js";

export interface ReadMarginReportInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
  group: SalesReportGroup;
}

export interface MarginReportView {
  range: ReportPeriod;
  group: SalesReportGroup;
  rows: MarginOfGroup[];
  totals: MarginTotals;
}

export async function readMarginReport(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: SaleMarginReportReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked, registerId, group }: ReadMarginReportInput,
): Promise<MarginReportView> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const query = { locationId, range, registerId };
  const lines =
    group === "product"
      ? await reader.completedSaleLinesByProduct(query)
      : await reader.completedSaleLinesByCategory(query);
  return { range, group, ...marginReport(lines) };
}
