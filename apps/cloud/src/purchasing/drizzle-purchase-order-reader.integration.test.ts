import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseOrderReader } from "./drizzle-purchase-order-reader.js";
import { insertSentOrder, receiveOrder } from "./test-support/purchase-order-receipt-fixtures.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

// A second real-Postgres connection commits a receipt mid-read; PGlite's single connection can't
// produce that interleaving.
const SECOND_DELIVERY_AT = new Date("2026-03-11T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let reader: DrizzlePurchaseOrderReader<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("purchase_order_read");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  // Only the schema's owner may LOCK TABLE; the read itself still runs as `cloud_app`.
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 2 });
  db = drizzle(sql);
  reader = new DrizzlePurchaseOrderReader(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

async function orderReceivedInPart(): Promise<{
  locationId: string;
  orderId: string;
  purchaseId: string;
}> {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const { orderId, productIds } = await insertSentOrder(db, {
    actorId,
    locationId,
    products: [
      { name: "Yerba", packages: 3, quantityPerPackage: 12_000, packagePriceCents: 3_000 },
    ],
  });
  const first = await receiveOrder(db, {
    locationId,
    orderId,
    actorId,
    lines: [
      {
        loadedBy: "packages",
        productId: productIds[0] as string,
        packages: 1,
        quantityPerPackage: 12_000,
        costPaidCents: 3_000,
        expiresOn: null,
      },
    ],
  });
  if (first.kind !== "received") {
    throw new Error(`test setup: receiving ended as ${first.kind}`);
  }
  return { locationId, orderId, purchaseId: first.purchaseId };
}

async function deliverTheRestDuring<TRead>(
  { orderId, purchaseId }: { orderId: string; purchaseId: string },
  startRead: () => Promise<TRead>,
): Promise<TRead> {
  const writer = await adminSql.reserve();
  let read: Promise<TRead> | undefined;
  try {
    await writer`begin`;
    await writer`lock table purchase_order_receipt_lines in access exclusive mode`;
    read = startRead();
    await waitForLockWaiters(adminSql, 1);
    const [purchase] = await writer<{ id: string }[]>`
      insert into purchases (supplier_id, location_id, purchased_on, receipt_type, receipt_number,
        note, recorded_at, actor_id)
      select supplier_id, location_id, purchased_on, receipt_type, receipt_number, note,
        ${SECOND_DELIVERY_AT}, actor_id
      from purchases where id = ${purchaseId}
      returning id`;
    const [receipt] = await writer<{ id: string }[]>`
      insert into purchase_order_receipts (purchase_order_id, purchase_id, actor_id, received_at)
      select purchase_order_id, ${purchase?.id ?? null}, actor_id, ${SECOND_DELIVERY_AT}
      from purchase_order_receipts where purchase_id = ${purchaseId}
      returning id`;
    await writer`
      insert into purchase_order_receipt_lines (purchase_order_receipt_id, purchase_order_line_id,
        received_quantity, missing_quantity, price_difference_cents)
      select ${receipt?.id ?? null}, id, 24000, 0, 0
      from purchase_order_lines where purchase_order_id = ${orderId}`;
    await writer`
      update purchase_orders set state = 'RECEIVED', received_at = ${SECOND_DELIVERY_AT}
      where id = ${orderId}`;
    await writer`commit`;
  } catch (error) {
    await writer`rollback`;
    throw error;
  } finally {
    writer.release();
  }
  return read;
}

describe("reading a purchase order while a delivery is received, on a real Postgres through postgres-js", () => {
  it("answers the order's state, what each line received and its receipts from the same moment", async () => {
    const order = await orderReceivedInPart();

    const during = await deliverTheRestDuring(order, () =>
      reader.order(order.locationId, order.orderId),
    );

    expect(during).toMatchObject({
      state: "PARTIALLY_RECEIVED",
      lines: [{ receivedQuantity: 12_000 }],
    });
    expect(during?.receipts).toHaveLength(1);
    expect(await reader.order(order.locationId, order.orderId)).toMatchObject({
      state: "RECEIVED",
      lines: [{ receivedQuantity: 36_000 }],
    });
  });

  it("answers the receivable order's state and what each line received from the same moment", async () => {
    const order = await orderReceivedInPart();

    const during = await deliverTheRestDuring(order, () =>
      reader.receivableOrder(order.locationId, order.orderId),
    );

    expect(during).toMatchObject({
      state: "PARTIALLY_RECEIVED",
      lines: [{ receivedQuantity: 12_000 }],
    });
    expect(await reader.receivableOrder(order.locationId, order.orderId)).toMatchObject({
      state: "RECEIVED",
      lines: [{ receivedQuantity: 36_000 }],
    });
  });
});
