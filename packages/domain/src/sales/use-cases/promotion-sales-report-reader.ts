import type { ReportPeriod } from "../../shared/index.js";
import type { DiscountedLinesOfPromotion } from "../model/sales-by-promotion.js";

export interface PromotionSalesQuery {
  locationId: string;
  range: ReportPeriod;
  registerId: string | undefined;
}

export interface PromotionSalesReportReader {
  completedSalesByPromotion(query: PromotionSalesQuery): Promise<DiscountedLinesOfPromotion[]>;
}
