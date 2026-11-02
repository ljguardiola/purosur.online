import type { ReturnRecord, VoidedSaleRecord } from "../../model/returns-report.js";
import type {
  ReturnsAndVoids,
  ReturnsReportQuery,
  ReturnsReportReader,
} from "../returns-report-reader.js";

export class FakeReturnsReportReader implements ReturnsReportReader {
  readonly reads: ReturnsReportQuery[] = [];

  private readonly records: readonly ReturnRecord[];

  private readonly voids: readonly VoidedSaleRecord[];

  constructor(records: readonly ReturnRecord[] = [], voids: readonly VoidedSaleRecord[] = []) {
    this.records = records;
    this.voids = voids;
  }

  async returnsAndVoidsMade(query: ReturnsReportQuery): Promise<ReturnsAndVoids> {
    this.reads.push({ ...query, range: { ...query.range } });
    return {
      returns: this.records.map((record) => ({ ...record })),
      voids: this.voids.map((record) => ({ ...record })),
    };
  }
}
