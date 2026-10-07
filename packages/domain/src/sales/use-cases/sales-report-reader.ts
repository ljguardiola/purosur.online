import type { SalesOfDay, SalesReportRange } from "../model/sales-report.js";

export interface SalesByDayQuery {
  locationId: string;
  range: SalesReportRange;
  registerId: string | undefined;
}

export interface ReportRegister {
  id: string;
  name: string;
}

export interface SalesReportReader {
  completedSalesByDay(query: SalesByDayQuery): Promise<SalesOfDay[]>;
  registersOfBranch(locationId: string): Promise<ReportRegister[]>;
}
