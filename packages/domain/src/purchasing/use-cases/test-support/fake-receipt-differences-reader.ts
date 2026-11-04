import type { ReceiptLineRow } from "../../model/receipt-differences-report.js";
import type {
  ReceiptDifferencesQuery,
  ReceiptDifferencesReader,
} from "../receipt-differences-reader.js";

export class FakeReceiptDifferencesReader implements ReceiptDifferencesReader {
  readonly reads: ReceiptDifferencesQuery[] = [];
  private readonly rows: readonly ReceiptLineRow[];

  constructor(rows: readonly ReceiptLineRow[] = []) {
    this.rows = rows;
  }

  async receiptLines(query: ReceiptDifferencesQuery): Promise<ReceiptLineRow[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.rows.map((row) => ({ ...row }));
  }
}
