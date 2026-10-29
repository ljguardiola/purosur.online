import {
  type Clock,
  type ReportPeriod,
  reportPeriodOf,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  type RemovalsOfCashier,
  type RemovalsOfSession,
  type RemovalsTotals,
  tallyRemovals,
} from "../model/removed-lines-and-cancelled-sales-report.js";
import type { RemovedLinesAndCancelledSalesReportReader } from "./removed-lines-and-cancelled-sales-report-reader.js";

export interface ReadRemovedLinesAndCancelledSalesInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface RemovedLinesAndCancelledSalesReport {
  range: ReportPeriod;
  cashiers: RemovalsOfCashier[];
  sessions: RemovalsOfSession[];
  totals: RemovalsTotals;
}

export async function readRemovedLinesAndCancelledSales(
  {
    reader,
    clock,
    zoneRules,
  }: {
    reader: RemovedLinesAndCancelledSalesReportReader;
    clock: Clock;
    zoneRules: ZoneRulesSource;
  },
  { locationId, asked, registerId }: ReadRemovedLinesAndCancelledSalesInput,
): Promise<RemovedLinesAndCancelledSalesReport> {
  const range = reportPeriodOf(asked, clock.now(), zoneRules.zoneRules());
  const facts = await reader.removalFacts({ locationId, range, registerId });
  return { range, ...tallyRemovals(facts) };
}
