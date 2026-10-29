import type { PurchasedLine } from "../../model/purchases-by-supplier-report.js";
import type { PurchasesReportQuery, PurchasesReportReader } from "../purchases-report-reader.js";

export class FakePurchasesReportReader implements PurchasesReportReader {
  readonly reads: PurchasesReportQuery[] = [];
  private readonly lines: readonly PurchasedLine[];

  constructor(lines: readonly PurchasedLine[] = []) {
    this.lines = lines;
  }

  async purchasedLines(query: PurchasesReportQuery): Promise<PurchasedLine[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.lines.map((line) => ({ ...line }));
  }
}
