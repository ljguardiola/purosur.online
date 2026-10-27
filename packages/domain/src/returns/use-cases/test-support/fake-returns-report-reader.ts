import type { ReturnRecord } from "../../model/returns-report.js";
import type { ReturnsReportQuery, ReturnsReportReader } from "../returns-report-reader.js";

export class FakeReturnsReportReader implements ReturnsReportReader {
  readonly reads: ReturnsReportQuery[] = [];

  constructor(private readonly records: readonly ReturnRecord[] = []) {}

  async returnsMade(query: ReturnsReportQuery): Promise<ReturnRecord[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.records.map((record) => ({ ...record }));
  }
}
