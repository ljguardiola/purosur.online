import type {
  LineDiscountRecord,
  ManualDiscountRecords,
  SaleDiscountRecord,
} from "../../model/manual-discounts-report.js";
import type {
  ManualDiscountsQuery,
  ManualDiscountsReportReader,
} from "../manual-discounts-report-reader.js";

export class FakeManualDiscountsReportReader implements ManualDiscountsReportReader {
  readonly reads: ManualDiscountsQuery[] = [];
  private readonly saleDiscounts: SaleDiscountRecord[];
  private readonly lineDiscounts: LineDiscountRecord[];

  constructor({ saleDiscounts, lineDiscounts }: Partial<ManualDiscountRecords> = {}) {
    this.saleDiscounts = saleDiscounts ?? [];
    this.lineDiscounts = lineDiscounts ?? [];
  }

  async completedManualDiscounts(query: ManualDiscountsQuery): Promise<ManualDiscountRecords> {
    this.reads.push({ ...query, range: { ...query.range } });
    return {
      saleDiscounts: this.saleDiscounts.map((record) => ({ ...record })),
      lineDiscounts: this.lineDiscounts.map((record) => ({ ...record })),
    };
  }
}
