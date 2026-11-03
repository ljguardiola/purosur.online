import type { CashRoundingRecord } from "../../model/cash-rounding-report.js";
import type {
  CashRoundingQuery,
  CashRoundingReportReader,
} from "../cash-rounding-report-reader.js";

export class FakeCashRoundingReportReader implements CashRoundingReportReader {
  readonly reads: CashRoundingQuery[] = [];
  private readonly records: CashRoundingRecord[];

  constructor(records: CashRoundingRecord[] = []) {
    this.records = records;
  }

  async completedCashRoundings(query: CashRoundingQuery): Promise<CashRoundingRecord[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.records
      .filter((record) => record.day >= query.range.from && record.day <= query.range.to)
      .filter((record) => query.registerId === undefined || record.registerId === query.registerId)
      .map((record) => ({ ...record }));
  }
}
