import type { ReportPeriod } from "../../shared/index.js";
import type { ReturnRecord, VoidedSaleRecord } from "../model/returns-report.js";

export interface ReturnsReportQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface ReturnsAndVoids {
  returns: ReturnRecord[];
  voids: VoidedSaleRecord[];
}

export interface ReturnsReportReader {
  returnsAndVoidsMade(query: ReturnsReportQuery): Promise<ReturnsAndVoids>;
}
