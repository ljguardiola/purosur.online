import type { ReportPeriod } from "../../shared/index.js";
import type { CashRoundingRecord } from "../model/cash-rounding-report.js";

export interface CashRoundingQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface CashRoundingReportReader {
  completedCashRoundings(query: CashRoundingQuery): Promise<CashRoundingRecord[]>;
}
