import { createSupplier, registerPurchase } from "@purosur/domain/purchasing/use-cases";
import { recordLoss } from "@purosur/domain/stock/use-cases";
import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stockBalances } from "../platform/db/schema.js";
import { DrizzleStockStore } from "../stock/drizzle-stock-store.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

// PGlite serializes every query on one connection, so only a real Postgres pool can run a purchase
// and another stock movement of the same product at once; the test queues both behind the
// balance row's lock.
const NOW = new Date("2026-10-15T15:00:00.000Z");
const clock = { now: () => NOW };
const START_BALANCE = 10_000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("purchase_stock_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function stockedProductWithSupplier() {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const product = await insertProduct(db, { name: "Miel pura de abeja 1 kg" });
  await db
    .insert(stockBalances)
    .values({ productId: product.id, locationId, quantity: START_BALANCE });
  const supplier = await createSupplier(new DrizzlePurchasingStore(db, clock.now), {
    name: `Distribuidora Sur ${crypto.randomUUID()}`,
    cuit: null,
    contact: null,
    note: null,
    actorId,
  });
  if (supplier.kind !== "created") {
    throw new Error(`test setup: creating the supplier ended as ${supplier.kind}`);
  }
  return { actorId, locationId, productId: product.id, supplierId: supplier.supplier.id };
}

function holdBalanceRowLock(productId: string, locationId: string) {
  return (holder: postgres.ReservedSql) =>
    holder`select quantity from stock_balances
      where product_id = ${productId} and location_id = ${locationId} for update`;
}

async function balanceOf(productId: string, locationId: string): Promise<number | undefined> {
  const [row] = await db
    .select({ quantity: stockBalances.quantity })
    .from(stockBalances)
    .where(and(eq(stockBalances.productId, productId), eq(stockBalances.locationId, locationId)));
  return row?.quantity;
}

describe("a purchase and a loss of the same product queued behind each other, on a real Postgres", () => {
  it("records both, the purchase holding the product without blocking the loss's movement", async () => {
    const ids = await stockedProductWithSupplier();

    const [lost, purchased] = await runQueuedBehindHeldLock(
      sql,
      holdBalanceRowLock(ids.productId, ids.locationId),
      () =>
        recordLoss(
          { store: new DrizzleStockStore(db), clock },
          {
            productId: ids.productId,
            locationId: ids.locationId,
            reason: "spoiled",
            quantity: 2_000,
            actorId: ids.actorId,
          },
        ),
      () =>
        registerPurchase(
          { store: new DrizzlePurchasingStore(db, clock.now), clock },
          {
            supplierId: ids.supplierId,
            purchasedOn: "2026-10-15",
            receiptType: "sin_comprobante",
            receiptNumber: null,
            note: null,
            lines: [
              {
                loadedBy: "quantity",
                productId: ids.productId,
                quantity: 5_000,
                costPaidCents: 90_000,
                lotNumber: null,
                expiresOn: null,
              },
            ],
            actorId: ids.actorId,
            locationId: ids.locationId,
          },
        ),
    );

    expect(lost.kind).toBe("recorded");
    expect(purchased.kind).toBe("registered");
    expect(await balanceOf(ids.productId, ids.locationId)).toBe(START_BALANCE - 2_000 + 5_000);
  });
});
