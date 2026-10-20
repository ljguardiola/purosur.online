import { type Clock, type ReportPeriod, reportPeriodOf } from "../../shared/index.js";
import {
  type PromotionDiscountTotals,
  promotionDiscountTotals,
  type SalesOfPromotion,
  salesOfPromotions,
} from "../model/sales-by-promotion.js";
import type { PromotionSalesReportReader } from "./promotion-sales-report-reader.js";

export interface ReadSalesByPromotionInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
  registerId: string | undefined;
}

export interface SalesByPromotionReport {
  range: ReportPeriod;
  rows: SalesOfPromotion[];
  totals: PromotionDiscountTotals;
}

export async function readSalesByPromotion(
  { reader, clock }: { reader: PromotionSalesReportReader; clock: Clock },
  { locationId, asked, registerId }: ReadSalesByPromotionInput,
): Promise<SalesByPromotionReport> {
  const range = reportPeriodOf(asked, clock.now());
  const discounted = await reader.completedSalesByPromotion({ locationId, range, registerId });
  const rows = salesOfPromotions(discounted);
  return { range, rows, totals: promotionDiscountTotals(rows) };
}
