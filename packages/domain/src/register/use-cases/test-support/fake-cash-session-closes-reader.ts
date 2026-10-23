import type { CashSessionClose } from "../../model/cash-session-closes.js";
import type {
  CashSessionClosesQuery,
  CashSessionClosesReportReader,
} from "../cash-session-closes-report-reader.js";

export class FakeCashSessionClosesReader implements CashSessionClosesReportReader {
  readonly reads: CashSessionClosesQuery[] = [];
  private readonly closes: CashSessionClose[];

  constructor(closes: CashSessionClose[] = []) {
    this.closes = closes;
  }

  async closedCashSessions(query: CashSessionClosesQuery): Promise<CashSessionClose[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.closes.map((close) => ({ ...close }));
  }
}
