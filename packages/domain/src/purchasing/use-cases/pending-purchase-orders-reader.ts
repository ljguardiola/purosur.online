import type { ReportPeriod } from "../../shared/index.js";
import type { PendingPurchaseOrderRow } from "../model/pending-purchase-orders-report.js";

export interface PendingPurchaseOrdersQuery {
  locationId: string;
  range: ReportPeriod;
}

export interface PendingPurchaseOrdersReader {
  ordersPendingReceipt(query: PendingPurchaseOrdersQuery): Promise<PendingPurchaseOrderRow[]>;
}
