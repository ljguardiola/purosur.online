import type { ReportPeriod } from "../../shared/index.js";
import type { PurchasedLine } from "../model/purchases-by-supplier-report.js";

export interface PurchasesReportQuery {
  locationId: string;
  range: ReportPeriod;
}

export interface PurchasesReportReader {
  purchasedLines(query: PurchasesReportQuery): Promise<PurchasedLine[]>;
}
