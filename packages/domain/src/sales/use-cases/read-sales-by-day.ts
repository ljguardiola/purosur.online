import type { Clock } from "../../shared/index.js";
import {
  defaultSalesReportRange,
  type SalesOfDay,
  type SalesReportRange,
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
  range: SalesReportRange;
  days: SalesOfDay[];
  totals: SalesReportTotals;
}

export async function readSalesByDay(
  { reader, clock }: { reader: SalesReportReader; clock: Clock },
  { locationId, asked, registerId }: ReadSalesByDayInput,
): Promise<SalesByDayReport> {
  const range =
    asked.from !== undefined && asked.to !== undefined
      ? { from: asked.from, to: asked.to }
      : defaultSalesReportRange(clock.now());
  const days = await reader.completedSalesByDay({ locationId, range, registerId });
  return { range, days, totals: salesReportTotals(days) };
}
