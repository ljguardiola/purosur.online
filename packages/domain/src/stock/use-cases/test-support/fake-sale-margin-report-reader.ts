import type { MarginSaleLine } from "../../model/margin-report.js";
import type { MarginQuery, SaleMarginReportReader } from "../sale-margin-report-reader.js";

export class FakeSaleMarginReportReader implements SaleMarginReportReader {
  readonly productReads: MarginQuery[] = [];
  readonly categoryReads: MarginQuery[] = [];
  private readonly ofProducts: MarginSaleLine[];
  private readonly ofCategories: MarginSaleLine[];

  constructor(sold: { products?: MarginSaleLine[]; categories?: MarginSaleLine[] } = {}) {
    this.ofProducts = sold.products ?? [];
    this.ofCategories = sold.categories ?? [];
  }

  async completedSaleLinesByProduct(query: MarginQuery): Promise<MarginSaleLine[]> {
    this.productReads.push({ ...query, range: { ...query.range } });
    return this.ofProducts.map((line) => ({ ...line }));
  }

  async completedSaleLinesByCategory(query: MarginQuery): Promise<MarginSaleLine[]> {
    this.categoryReads.push({ ...query, range: { ...query.range } });
    return this.ofCategories.map((line) => ({ ...line }));
  }
}
