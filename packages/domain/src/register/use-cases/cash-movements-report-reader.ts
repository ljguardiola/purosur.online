import type { ReportPeriod } from "../../shared/index.js";
import type { ReportedCashMovement } from "../model/cash-movements-report.js";

export interface CashMovementsQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface CashMovementsReportReader {
  reportedCashMovements(query: CashMovementsQuery): Promise<ReportedCashMovement[]>;
}
