import type { ReportPeriod } from "../../shared/index.js";
import type { ReturnRecord } from "../model/returns-report.js";

export interface ReturnsReportQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface ReturnsReportReader {
  returnsMade(query: ReturnsReportQuery): Promise<ReturnRecord[]>;
}
