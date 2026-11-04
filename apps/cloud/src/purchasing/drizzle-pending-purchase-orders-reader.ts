import {
  ARGENTINA_TIME_ZONE,
  mayBeReceived,
  type PendingPurchaseOrderRow,
  PURCHASE_ORDER_STATES,
} from "@purosur/domain";
import type {
  PendingPurchaseOrdersQuery,
  PendingPurchaseOrdersReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, between, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { purchaseOrderLines, purchaseOrders, suppliers } from "../platform/db/schema.js";

const READ_SNAPSHOT = { isolationLevel: "repeatable read", accessMode: "read only" } as const;

const sentDay = sql<string>`to_char(${purchaseOrders.sentAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

export class DrizzlePendingPurchaseOrdersReader<TQueryResult extends PgQueryResultHKT>
  implements PendingPurchaseOrdersReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  ordersPendingReceipt(query: PendingPurchaseOrdersQuery): Promise<PendingPurchaseOrderRow[]> {
    return this.db.transaction((tx) => this.readIn(tx, query), READ_SNAPSHOT);
  }

  private async readIn(
    db: PgDatabase<TQueryResult>,
    { locationId, range }: PendingPurchaseOrdersQuery,
  ): Promise<PendingPurchaseOrderRow[]> {
    const rows = await db
      .select({
        orderId: purchaseOrders.id,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        state: purchaseOrders.state,
        sentAt: purchaseOrders.sentAt,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(
        and(
          eq(purchaseOrders.locationId, locationId),
          inArray(purchaseOrders.state, PURCHASE_ORDER_STATES.filter(mayBeReceived)),
          between(sentDay, range.from, range.to),
        ),
      );
    if (rows.length === 0) {
      return [];
    }
    const lineRows = await db
      .select({
        purchaseOrderId: purchaseOrderLines.purchaseOrderId,
        packages: purchaseOrderLines.packages,
        expectedPackagePriceCents: purchaseOrderLines.expectedPackagePriceCents,
      })
      .from(purchaseOrderLines)
      .where(
        inArray(
          purchaseOrderLines.purchaseOrderId,
          rows.map(({ orderId }) => orderId),
        ),
      );
    return rows.map(({ sentAt, state, ...order }) => ({
      ...order,
      state: state as PendingPurchaseOrderRow["state"],
      sentAt: sentAt as Date,
      lines: lineRows
        .filter((line) => line.purchaseOrderId === order.orderId)
        .map(({ packages, expectedPackagePriceCents }) => ({
          packages,
          expectedPackagePriceCents,
        })),
    }));
  }
}
