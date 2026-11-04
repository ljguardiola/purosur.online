import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purchaseOrderReceipts, purchases } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { insertSentOrder, receiveOrder } from "./test-support/purchase-order-receipt-fixtures.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("purchase_order_receipt_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two people receiving the same purchase order at once, on a real Postgres", () => {
  it("records the first delivery and refuses the second queued behind it as already received, so the order is never received twice", async () => {
    const actorId = await insertActor(db);
    const locationId = await seededLocationId(db);
    const { orderId, productIds } = await insertSentOrder(db, {
      actorId,
      locationId,
      products: [
        { name: "Yerba", packages: 3, quantityPerPackage: 12_000, packagePriceCents: 3_000 },
      ],
    });
    const delivery = [
      {
        loadedBy: "packages" as const,
        productId: productIds[0] as string,
        packages: 3,
        quantityPerPackage: 12_000,
        costPaidCents: 3_000,
        expiresOn: null,
      },
    ];

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (connection) => connection`select id from purchase_orders where id = ${orderId} for update`,
      () => receiveOrder(db, { locationId, orderId, actorId, lines: delivery }),
      () => receiveOrder(db, { locationId, orderId, actorId, lines: delivery }),
    );

    expect(first).toMatchObject({ kind: "received", state: "RECEIVED" });
    expect(second).toEqual({ kind: "not_receivable" });
    const receipts = await db
      .select()
      .from(purchaseOrderReceipts)
      .where(eq(purchaseOrderReceipts.purchaseOrderId, orderId));
    expect(receipts).toHaveLength(1);
    expect(await db.select().from(purchases)).toHaveLength(1);
  });
});
