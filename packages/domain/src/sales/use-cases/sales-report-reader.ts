import type { ReportPeriod } from "../../shared/index.js";
import type { SalesOfDay } from "../model/sales-report.js";

export interface SalesByDayQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface SalesReportReader {
  completedSalesByDay(query: SalesByDayQuery): Promise<SalesOfDay[]>;
}
