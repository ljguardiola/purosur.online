import type { ReportPeriod } from "../../shared/index.js";
import type { SoldByCashier } from "../model/sales-by-cashier.js";

export interface CashierSalesQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface CashierSalesReportReader {
  completedSalesByCashier(query: CashierSalesQuery): Promise<SoldByCashier[]>;
}
