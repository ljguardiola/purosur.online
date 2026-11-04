import { listOrderSuggestion } from "@purosur/domain/purchasing/use-cases";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleOrderSuggestionReader } from "./drizzle-order-suggestion-reader.js";
import {
  completeSale,
  insertRegisterDeviceIn,
  setStock,
} from "./test-support/order-suggestion-fixtures.js";
import { insertSentOrder, receiveOrder } from "./test-support/purchase-order-receipt-fixtures.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

// A second real-Postgres connection commits a receipt mid-read; PGlite's single connection can't
// produce that interleaving.
const NOW = new Date("2026-09-16T15:00:00.000Z");
const SECOND_DELIVERY_AT = new Date("2026-09-15T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let reader: DrizzleOrderSuggestionReader<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("order_suggestion_read");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  // Only the schema's owner may LOCK TABLE; the read itself still runs as `cloud_app`.
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 2 });
  db = drizzle(sql);
  reader = new DrizzleOrderSuggestionReader(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

async function soldOrderReceivedInPart(): Promise<{
  locationId: string;
  orderId: string;
  productId: string;
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
  const [productId] = productIds as [string];
  const first = await receiveOrder(db, {
    locationId,
    orderId,
    actorId,
    lines: [
      {
        loadedBy: "packages",
        productId,
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
  const deviceId = await insertRegisterDeviceIn(db, locationId, NOW);
  await completeSale(db, {
    deviceId,
    productId,
    quantity: 300,
    completedAt: new Date("2026-09-10T15:00:00.000Z"),
  });
  await setStock(db, { productId, locationId, quantity: 12_000 });
  return { locationId, orderId, productId, purchaseId: first.purchaseId };
}

async function deliverTheRestDuring<TRead>(
  {
    locationId,
    orderId,
    productId,
    purchaseId,
  }: { locationId: string; orderId: string; productId: string; purchaseId: string },
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
    await writer`
      update stock_balances set quantity = quantity + 24000
      where product_id = ${productId} and location_id = ${locationId}`;
    await writer`commit`;
  } catch (error) {
    await writer`rollback`;
    throw error;
  } finally {
    writer.release();
  }
  return read;
}

function suggestionFor(locationId: string) {
  return listOrderSuggestion(
    { reader, clock: { now: () => NOW }, zoneRules: fixedZoneRulesSource() },
    { locationId },
  );
}

describe("suggesting an order while a delivery is received, on a real Postgres through postgres-js", () => {
  it("answers the stock and what orders still have to bring from the same moment", async () => {
    const order = await soldOrderReceivedInPart();

    const during = await deliverTheRestDuring(order, () => suggestionFor(order.locationId));
    const after = await suggestionFor(order.locationId);

    expect(during.lines).toMatchObject([{ stock: 12_000, awaitedQuantity: 24_000 }]);
    expect(after.lines).toMatchObject([{ stock: 36_000, awaitedQuantity: 0 }]);
  });
});
