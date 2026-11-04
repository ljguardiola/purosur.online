import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  purchaseOrderLines,
  purchaseOrderReceiptLines,
  purchaseOrderReceipts,
} from "../../platform/db/schema.js";
import { insertOrderRow } from "./pending-purchase-orders-fixtures.js";
import { insertPurchaseOfLines } from "./purchases-report-fixtures.js";

export interface ReceivedOrderInput {
  supplierId: string;
  locationId: string;
  actorId: string;
  productId: string;
  receivedAt: Date;
  lines?: readonly {
    receivedQuantity: number;
    missingQuantity: number;
    priceDifferenceCents: number | null;
  }[];
}

export async function insertReceivedOrder<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: ReceivedOrderInput,
): Promise<{ orderId: string; receiptId: string }> {
  const receiptLines = input.lines ?? [
    { receivedQuantity: 6_000, missingQuantity: 4_000, priceDifferenceCents: null },
  ];
  const orderId = await insertOrderRow(db, {
    ...input,
    state: "PARTIALLY_RECEIVED",
    lines: receiptLines.map(() => ({ packages: 10, expectedPackagePriceCents: 1_000 })),
  });
  const purchaseId = await insertPurchaseOfLines(db, {
    ...input,
    purchasedOn: "2026-10-01",
    lines: [{ costPaidCents: 1_000, quantity: 1_000, quantityPerPackage: 1_000 }],
  });
  const [receipt] = await db
    .insert(purchaseOrderReceipts)
    .values({
      purchaseOrderId: orderId,
      purchaseId,
      actorId: input.actorId,
      receivedAt: input.receivedAt,
    })
    .returning({ id: purchaseOrderReceipts.id });
  if (!receipt) {
    throw new Error("test setup: inserting the receipt returned no row");
  }
  const orderLines = await db
    .select({ id: purchaseOrderLines.id })
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, orderId))
    .orderBy(asc(purchaseOrderLines.position));
  await db.insert(purchaseOrderReceiptLines).values(
    receiptLines.map((line, index) => ({
      purchaseOrderReceiptId: receipt.id,
      purchaseOrderLineId: (orderLines[index] as { id: string }).id,
      ...line,
    })),
  );
  return { orderId, receiptId: receipt.id };
}
