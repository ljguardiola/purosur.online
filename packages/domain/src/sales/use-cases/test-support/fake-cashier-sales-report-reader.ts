import type { SoldByCashier } from "../../model/sales-by-cashier.js";
import type {
  CashierSalesQuery,
  CashierSalesReportReader,
} from "../cashier-sales-report-reader.js";

export class FakeCashierSalesReportReader implements CashierSalesReportReader {
  readonly reads: CashierSalesQuery[] = [];
  private readonly sold: SoldByCashier[];

  constructor(sold: SoldByCashier[] = []) {
    this.sold = sold;
  }

  async completedSalesByCashier(query: CashierSalesQuery): Promise<SoldByCashier[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.sold.map((row) => ({ ...row }));
  }
}
