import {
  type Clock,
  type ReportPeriod,
  trailingReportPeriod,
  type ZoneRulesSource,
} from "../../shared/index.js";
import {
  PENDING_PURCHASE_ORDERS_DEFAULT_DAYS,
  type PendingPurchaseOrders,
  pendingPurchaseOrders,
} from "../model/pending-purchase-orders-report.js";
import type { PendingPurchaseOrdersReader } from "./pending-purchase-orders-reader.js";

export interface ReadPendingPurchaseOrdersInput {
  locationId: string;
  asked: { from: string | undefined; to: string | undefined };
}

export interface PendingPurchaseOrdersReport extends PendingPurchaseOrders {
  range: ReportPeriod;
}

export async function readPendingPurchaseOrders(
  {
    reader,
    clock,
    zoneRules,
  }: { reader: PendingPurchaseOrdersReader; clock: Clock; zoneRules: ZoneRulesSource },
  { locationId, asked: { from, to } }: ReadPendingPurchaseOrdersInput,
): Promise<PendingPurchaseOrdersReport> {
  const range =
    from !== undefined && to !== undefined
      ? { from, to }
      : trailingReportPeriod(
          clock.now(),
          zoneRules.zoneRules(),
          PENDING_PURCHASE_ORDERS_DEFAULT_DAYS,
        );
  const rows = await reader.ordersPendingReceipt({ locationId, range });
  return { range, ...pendingPurchaseOrders(rows) };
}
