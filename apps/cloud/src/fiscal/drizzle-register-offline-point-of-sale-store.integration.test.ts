import { assignFirstOfflineNumberBlock } from "@purosur/domain/fiscal/use-cases";
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

function assignFirstBlock() {
  return new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOON).transaction((tx) =>
    assignFirstOfflineNumberBlock(tx, {
      pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
      documentType: "factura_c",
      registerId,
    }),
  );
}

describe("the offline number blocks on a real Postgres", () => {
  it("assigns one first block, 1 to 1000, to first blocks asked for one point of sale at the same time", async () => {
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => assignFirstBlock()));

    const blocks = await db
      .select({
        firstNumber: offlineNumberBlocks.firstNumber,
        lastNumber: offlineNumberBlocks.lastNumber,
      })
      .from(offlineNumberBlocks)
      .orderBy(asc(offlineNumberBlocks.firstNumber));
    expect(blocks).toEqual([{ firstNumber: 1, lastNumber: 1000 }]);
    expect(outcomes.filter(({ kind }) => kind === "assigned")).toHaveLength(1);
  });

  it("keeps every block for good: the cloud's own role can neither delete nor truncate them", async () => {
    await assignFirstBlock();

    await expect(sql`delete from offline_number_blocks`).rejects.toThrow("permission denied");
    await expect(sql`truncate offline_number_blocks`).rejects.toThrow("permission denied");
    expect(await db.select().from(offlineNumberBlocks)).not.toEqual([]);
  });
});
