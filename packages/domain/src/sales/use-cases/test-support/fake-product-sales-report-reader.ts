import type { SoldLinesOfGroup } from "../../model/sold-lines-report.js";
import type { ProductSalesReportReader, SoldLinesQuery } from "../product-sales-report-reader.js";

export class FakeProductSalesReportReader implements ProductSalesReportReader {
  readonly productReads: SoldLinesQuery[] = [];
  readonly categoryReads: SoldLinesQuery[] = [];
  private readonly ofProducts: SoldLinesOfGroup[];
  private readonly ofCategories: SoldLinesOfGroup[];

  constructor(sold: { products?: SoldLinesOfGroup[]; categories?: SoldLinesOfGroup[] } = {}) {
    this.ofProducts = sold.products ?? [];
    this.ofCategories = sold.categories ?? [];
  }

  async completedSalesByProduct(query: SoldLinesQuery): Promise<SoldLinesOfGroup[]> {
    this.productReads.push({ ...query, range: { ...query.range } });
    return this.ofProducts.map((lines) => ({ ...lines }));
  }

  async completedSalesByCategory(query: SoldLinesQuery): Promise<SoldLinesOfGroup[]> {
    this.categoryReads.push({ ...query, range: { ...query.range } });
    return this.ofCategories.map((lines) => ({ ...lines }));
  }
}
