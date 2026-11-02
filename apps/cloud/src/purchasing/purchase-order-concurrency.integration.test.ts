import {
  buildPurchaseOrders,
  cancelPurchaseOrder,
  editPurchaseOrder,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purchaseOrderLines, purchaseOrders } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseOrderStore } from "./drizzle-purchase-order-store.js";
import { insertOfferedProduct } from "./test-support/purchase-order-fixtures.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("purchase_order_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two people changing the same draft purchase order at once, on a real Postgres", () => {
  it("cancels it first and refuses the edit queued behind it, leaving the lines as they were", async () => {
    const actorId = await insertActor(db);
    const locationId = await seededLocationId(db);
    const yerba = await insertOfferedProduct(db, {
      actorId,
      name: "Yerba",
      quantity: 6_000,
      priceCents: 12_000,
    });
    const store = new DrizzlePurchaseOrderStore(db);
    const built = await buildPurchaseOrders(
      { store, clock: { now: () => NOW } },
      { locationId, actorId, choices: [{ ...yerba, packages: 2 }] },
    );
    if (built.kind !== "created") {
      throw new Error(`test setup: building ended as ${built.kind}`);
    }
    const [orderId] = built.orderIds as [string];

    const [cancelled, edited] = await runQueuedBehindHeldLock(
      sql,
      (connection) => connection`select id from purchase_orders where id = ${orderId} for update`,
      () =>
        cancelPurchaseOrder({ store, clock: { now: () => NOW } }, { locationId, orderId, actorId }),
      () =>
        editPurchaseOrder(
          { store },
          {
            locationId,
            orderId,
            lines: [{ productId: yerba.productId, packages: 9, quantityPerPackage: 6_000 }],
          },
        ),
    );

    expect(cancelled).toEqual({ kind: "cancelled" });
    expect(edited).toEqual({ kind: "not_editable" });
    const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
    expect(order?.state).toBe("CANCELLED");
    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, orderId));
    expect(lines.map((line) => line.packages)).toEqual([2]);
  });
});
