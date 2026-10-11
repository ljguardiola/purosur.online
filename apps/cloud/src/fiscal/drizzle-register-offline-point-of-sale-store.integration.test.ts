import {
  assignAwaitedOfflineNumberBlock,
  assignFirstOfflineNumberBlock,
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import { asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fiscalAddresses,
  offlineNumberBlocks,
  registers,
  taxAuthorityLastAuthorizedNumbers,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";
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
  await db
    .insert(taxAuthorityLastAuthorizedNumbers)
    .values({ pointOfSaleNumber: OFFLINE_POINT_OF_SALE, lastAuthorized: 37, readAt: NOON });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function offlineStore() {
  return new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOON);
}

function assignAwaited(pointOfSaleNumber: number) {
  return assignAwaitedOfflineNumberBlock(offlineStore(), { pointOfSaleNumber });
}

async function seedTaxAuthorityCount(pointOfSaleNumber: number, lastAuthorized: number) {
  await db
    .insert(taxAuthorityLastAuthorizedNumbers)
    .values({ pointOfSaleNumber, lastAuthorized, readAt: NOON });
}

async function blocksOf(pointOfSaleNumber: number) {
  return db
    .select({
      firstNumber: offlineNumberBlocks.firstNumber,
      lastNumber: offlineNumberBlocks.lastNumber,
    })
    .from(offlineNumberBlocks)
    .where(eq(offlineNumberBlocks.pointOfSaleNumber, pointOfSaleNumber));
}

async function seedRegisterWithRealTime(pointOfSaleNumber: number, name: string) {
  const locationId = await seededLocationId(db);
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: `${name}@example.com`, locationId })
    .returning({ id: users.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: `Deposito ${name}`, streetAddress: "Calle Ficticia 456, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!actor || !register || !fiscalAddress) {
    throw new Error("test setup: seeding the register returned no row");
  }
  const base = { locationId, registerId: register.id, actorId: actor.id };
  await configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db, () => NOON), {
    ...base,
    pointOfSaleNumber,
    fiscalAddressId: fiscalAddress.id,
    version: 0,
  });
  return base;
}

function assignFirstBlock() {
  return offlineStore().transaction((tx) =>
    assignFirstOfflineNumberBlock(tx, {
      pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
      documentType: "factura_c",
      registerId,
    }),
  );
}

describe("the offline number blocks on a real Postgres", () => {
  it("assigns one first block, right after the tax authority's count, to first blocks asked for one point of sale at the same time", async () => {
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => assignFirstBlock()));

    const blocks = await db
      .select({
        firstNumber: offlineNumberBlocks.firstNumber,
        lastNumber: offlineNumberBlocks.lastNumber,
      })
      .from(offlineNumberBlocks)
      .orderBy(asc(offlineNumberBlocks.firstNumber));
    expect(blocks).toEqual([{ firstNumber: 38, lastNumber: 1037 }]);
    expect(outcomes.filter(({ kind }) => kind === "assigned")).toHaveLength(1);
  });

  it("keeps every block for good: the cloud's own role can neither delete nor truncate them", async () => {
    await assignFirstBlock();

    await expect(sql`delete from offline_number_blocks`).rejects.toThrow("permission denied");
    await expect(sql`truncate offline_number_blocks`).rejects.toThrow("permission denied");
    expect(await db.select().from(offlineNumberBlocks)).not.toEqual([]);
  });

  it("assigns one awaited block to awaited assignments asked for one point of sale at the same time", async () => {
    const base = await seedRegisterWithRealTime(30, "Caja 2");
    await configureRegisterOfflinePointOfSale(offlineStore(), {
      ...base,
      pointOfSaleNumber: 31,
      version: 0,
    });
    await seedTaxAuthorityCount(31, 5);

    const outcomes = await Promise.all(Array.from({ length: 6 }, () => assignAwaited(31)));

    expect(outcomes.filter(({ kind }) => kind === "assigned")).toHaveLength(1);
    expect(outcomes.filter(({ kind }) => kind === "already_has_block")).toHaveLength(5);
    expect(await blocksOf(31)).toEqual([{ firstNumber: 6, lastNumber: 1005 }]);
  });

  it("leaves one block when the configuration and awaited assignments of the same point of sale run at the same time", async () => {
    const base = await seedRegisterWithRealTime(40, "Caja 3");
    await seedTaxAuthorityCount(41, 5);

    await Promise.all([
      configureRegisterOfflinePointOfSale(offlineStore(), {
        ...base,
        pointOfSaleNumber: 41,
        version: 0,
      }),
      ...Array.from({ length: 4 }, () => assignAwaited(41)),
    ]);

    expect(await blocksOf(41)).toEqual([{ firstNumber: 6, lastNumber: 1005 }]);
  });
});
