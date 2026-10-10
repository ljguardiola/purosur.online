import { assignOfflineNumberBlock } from "@purosur/domain/fiscal/use-cases";
import { asc } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { offlineNumberBlocks, registers } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const OFFLINE_POINT_OF_SALE = 8;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("offline_number_blocks");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
  await seedOfflinePointOfSale(db);
  const [register] = await db.select({ id: registers.id }).from(registers);
  if (!register) {
    throw new Error("test setup: the seeded register is missing");
  }
  registerId = register.id;
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the offline number blocks on a real Postgres", () => {
  it("assigns blocks assigned at the same time to one point of sale as contiguous ranges that never overlap", async () => {
    const assignments = Array.from({ length: 6 }, () =>
      new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOON).transaction((tx) =>
        assignOfflineNumberBlock(tx, {
          pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
          documentType: "factura_c",
          registerId,
        }),
      ),
    );

    await Promise.all(assignments);

    const blocks = await db
      .select({
        firstNumber: offlineNumberBlocks.firstNumber,
        lastNumber: offlineNumberBlocks.lastNumber,
      })
      .from(offlineNumberBlocks)
      .orderBy(asc(offlineNumberBlocks.firstNumber));
    expect(blocks).toEqual([
      { firstNumber: 1, lastNumber: 1000 },
      { firstNumber: 1001, lastNumber: 2000 },
      { firstNumber: 2001, lastNumber: 3000 },
      { firstNumber: 3001, lastNumber: 4000 },
      { firstNumber: 4001, lastNumber: 5000 },
      { firstNumber: 5001, lastNumber: 6000 },
    ]);
  });
});
