import type { ReportPeriod } from "../../shared/index.js";
import type { SoldLinesOfGroup } from "../model/sold-lines-report.js";

export interface SoldLinesQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface ProductSalesReportReader {
  completedSalesByProduct(query: SoldLinesQuery): Promise<SoldLinesOfGroup[]>;
  completedSalesByCategory(query: SoldLinesQuery): Promise<SoldLinesOfGroup[]>;
}
