import type { ReturnRecord } from "../../model/returns-report.js";
import type { ReturnsReportQuery, ReturnsReportReader } from "../returns-report-reader.js";

export class FakeReturnsReportReader implements ReturnsReportReader {
  readonly reads: ReturnsReportQuery[] = [];

  private readonly records: readonly ReturnRecord[];

  constructor(records: readonly ReturnRecord[] = []) {
    this.records = records;
  }

  async returnsMade(query: ReturnsReportQuery): Promise<ReturnRecord[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.records.map((record) => ({ ...record }));
  }
}
