import type { SalesOfDay } from "../../model/sales-report.js";
import type { ReportRegister, SalesByDayQuery, SalesReportReader } from "../sales-report-reader.js";

export class FakeSalesReportReader implements SalesReportReader {
  readonly salesByDayReads: SalesByDayQuery[] = [];
  private readonly days: SalesOfDay[];
  private readonly registers: ReportRegister[];

  constructor(days: SalesOfDay[] = [], registers: ReportRegister[] = []) {
    this.days = days;
    this.registers = registers;
  }

  async completedSalesByDay(query: SalesByDayQuery): Promise<SalesOfDay[]> {
    this.salesByDayReads.push({ ...query, range: { ...query.range } });
    return this.days.map((day) => ({ ...day }));
  }

  async registersOfBranch(): Promise<ReportRegister[]> {
    return this.registers.map((register) => ({ ...register }));
  }
}
