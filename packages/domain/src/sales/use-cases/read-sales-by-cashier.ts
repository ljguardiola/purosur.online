import { type Clock, type ReportPeriod, reportPeriodOf } from "../../shared/index.js";
import {
  type CashierSalesTotals,
  cashierSalesTotals,
  type SalesOfCashier,
  salesOfCashiers,
} from "../model/sales-by-cashier.js";
import type { CashierSalesReportReader } from "./cashier-sales-report-reader.js";

export interface ReadSalesByCashierInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface SalesByCashierReport {
  range: ReportPeriod;
  rows: SalesOfCashier[];
  totals: CashierSalesTotals;
}

export async function readSalesByCashier(
  { reader, clock }: { reader: CashierSalesReportReader; clock: Clock },
  { locationId, asked, registerId }: ReadSalesByCashierInput,
): Promise<SalesByCashierReport> {
  const range = reportPeriodOf(asked, clock.now());
  const sold = await reader.completedSalesByCashier({ locationId, range, registerId });
  return { range, rows: salesOfCashiers(sold), totals: cashierSalesTotals(sold) };
}
