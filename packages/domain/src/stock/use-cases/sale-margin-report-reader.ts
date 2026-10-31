import type { ReportPeriod } from "../../shared/index.js";
import type { MarginSaleLine } from "../model/margin-report.js";

export interface MarginQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface SaleMarginReportReader {
  completedSaleLinesByProduct(query: MarginQuery): Promise<MarginSaleLine[]>;
  completedSaleLinesByCategory(query: MarginQuery): Promise<MarginSaleLine[]>;
}
