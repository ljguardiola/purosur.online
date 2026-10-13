import { type Clock, type ReportPeriod, reportPeriodOf } from "../../shared/index.js";
import type { SalesReportGroup } from "../model/sales-report-group.js";
import {
  type SalesOfGroup,
  type SoldTotals,
  salesOfGroups,
  soldTotals,
} from "../model/sold-lines-report.js";
import type { ProductSalesReportReader } from "./product-sales-report-reader.js";

export interface ReadSalesByProductAndCategoryInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
  group: SalesReportGroup;
}

export interface SalesByProductAndCategoryReport {
  range: ReportPeriod;
  group: SalesReportGroup;
  rows: SalesOfGroup[];
  totals: SoldTotals;
}

export async function readSalesByProductAndCategory(
  { reader, clock }: { reader: ProductSalesReportReader; clock: Clock },
  { locationId, asked, registerId, group }: ReadSalesByProductAndCategoryInput,
): Promise<SalesByProductAndCategoryReport> {
  const range = reportPeriodOf(asked, clock.now());
  const query = { locationId, range, registerId };
  const sold =
    group === "product"
      ? await reader.completedSalesByProduct(query)
      : await reader.completedSalesByCategory(query);
  const rows = salesOfGroups(sold);
  return { range, group, rows, totals: soldTotals(rows) };
}
