import type { PendingPurchaseOrderRow } from "../../model/pending-purchase-orders-report.js";
import type {
  PendingPurchaseOrdersQuery,
  PendingPurchaseOrdersReader,
} from "../pending-purchase-orders-reader.js";

export class FakePendingPurchaseOrdersReader implements PendingPurchaseOrdersReader {
  readonly reads: PendingPurchaseOrdersQuery[] = [];
  private readonly rows: readonly PendingPurchaseOrderRow[];

  constructor(rows: readonly PendingPurchaseOrderRow[] = []) {
    this.rows = rows;
  }

  async ordersPendingReceipt(
    query: PendingPurchaseOrdersQuery,
  ): Promise<PendingPurchaseOrderRow[]> {
    this.reads.push({ ...query, range: { ...query.range } });
    return this.rows.map((row) => ({ ...row }));
  }
}
