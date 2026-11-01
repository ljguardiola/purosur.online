import type { ReturnRecord, VoidedSaleRecord } from "../../model/returns-report.js";
import type { ReturnsReportQuery, ReturnsReportReader } from "../returns-report-reader.js";

export class FakeReturnsReportReader implements ReturnsReportReader {
  readonly reads: ReturnsReportQuery[] = [];

  readonly voidReads: ReturnsReportQuery[] = [];

  private readonly records: readonly ReturnRecord[];

  private readonly voids: readonly VoidedSaleRecord[];

  constructor(records: readonly ReturnRecord[] = [], voids: readonly VoidedSaleRecord[] = []) {
    this.records = records;
    this.voids = voids;
  }

  async returnsMade(query: ReturnsReportQuery): Promise<ReturnRecord[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.records.map((record) => ({ ...record }));
  }

  async salesVoided(query: ReturnsReportQuery): Promise<VoidedSaleRecord[]> {
    this.voidReads.push({ ...query, range: { ...query.range } });
    return this.voids.map((record) => ({ ...record }));
  }
}
