import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleDeferredSaleExpiryStore } from "./drizzle-deferred-sale-expiry-store.js";
import { insertDeferredSaleRow } from "./test-support/deferred-sale-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("deferred_sale_expiry");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("DrizzleDeferredSaleExpiryStore against a real Postgres", () => {
  it("leaves the deferred sales another evaluation is holding to that evaluation", async () => {
    const installation = await insertEnrolledInstallation(db, {
      now: new Date("2026-10-10T03:00:00.000Z"),
    });
    const sale = await insertDeferredSaleRow(db, installation);
    const store = new DrizzleDeferredSaleExpiryStore(db);
    const instant = new Date("2026-10-09T03:00:00.000Z");
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstHolds!: () => void;
    const firstHolding = new Promise<void>((resolve) => {
      firstHolds = resolve;
    });

    const first = store.transaction(async (transaction) => {
      const locked = await transaction.lockPendingDeferredSalesOccurredBefore(instant);
      firstHolds();
      await held;
      return locked;
    });
    await firstHolding;
    const second = await store.transaction((transaction) =>
      transaction.lockPendingDeferredSalesOccurredBefore(instant),
    );
    release();

    expect(second).toEqual([]);
    expect((await first).map(({ id }) => id)).toEqual([sale.id]);
  });
});
