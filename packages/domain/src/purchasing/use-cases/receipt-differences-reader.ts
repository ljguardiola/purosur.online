import type { ReportPeriod } from "../../shared/index.js";
import type { ReceiptLineRow } from "../model/receipt-differences-report.js";

export interface ReceiptDifferencesQuery {
  locationId: string;
  range: ReportPeriod;
}

export interface ReceiptDifferencesReader {
  receiptLines(query: ReceiptDifferencesQuery): Promise<ReceiptLineRow[]>;
}
