import type { ReportPeriod } from "../../shared/index.js";
import type { CashSessionClose } from "../model/cash-session-closes.js";

export interface CashSessionClosesQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface CashSessionClosesReportReader {
  closedCashSessions(query: CashSessionClosesQuery): Promise<CashSessionClose[]>;
}
