import type { ReportPeriod } from "../../shared/index.js";
import type { ManualDiscountRecords } from "../model/manual-discounts-report.js";

export interface ManualDiscountsQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface ManualDiscountsReportReader {
  completedManualDiscounts(query: ManualDiscountsQuery): Promise<ManualDiscountRecords>;
}
