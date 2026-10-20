import type { DiscountedLinesOfPromotion } from "../../model/sales-by-promotion.js";
import type {
  PromotionSalesQuery,
  PromotionSalesReportReader,
} from "../promotion-sales-report-reader.js";

export class FakePromotionSalesReportReader implements PromotionSalesReportReader {
  readonly reads: PromotionSalesQuery[] = [];
  private readonly discounted: DiscountedLinesOfPromotion[];

  constructor(discounted: DiscountedLinesOfPromotion[] = []) {
    this.discounted = discounted;
  }

  async completedSalesByPromotion(
    query: PromotionSalesQuery,
  ): Promise<DiscountedLinesOfPromotion[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.discounted.map((row) => ({ ...row }));
  }
}
