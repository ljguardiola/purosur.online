import type { SalesOfDay } from "../../model/sales-report.js";
import type { SalesByDayQuery, SalesReportReader } from "../sales-report-reader.js";

export class FakeSalesReportReader implements SalesReportReader {
  readonly salesByDayReads: SalesByDayQuery[] = [];
  private readonly days: SalesOfDay[];

  constructor(days: SalesOfDay[] = []) {
    this.days = days;
  }

  async completedSalesByDay(query: SalesByDayQuery): Promise<SalesOfDay[]> {
    this.salesByDayReads.push({ ...query, range: { ...query.range } });
    return this.days.map((day) => ({ ...day }));
  }
}
