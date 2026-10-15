import {
  assignAwaitedOfflineNumberBlock,
  assignFirstOfflineNumberBlock,
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changes,
  fiscalAddresses,
  offlineNumberBlocks,
  pointOfSaleClaims,
  registers,
  taxAuthorityLastAuthorizedNumbers,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import {
  insertAppliedOfflineDocument,
  insertReceivedOfflineDocumentEvent,
} from "./test-support/synced-offline-documents.js";

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

describe("the highest offline number synced, on a real Postgres", () => {
  async function highestSynced(pointOfSaleNumber: number) {
    return offlineStore().transaction((tx) =>
      tx.highestSyncedOfflineNumber(pointOfSaleNumber, "factura_c"),
    );
  }

  async function installation() {
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOON,
      existingRegisterId: registerId,
    });
    return { deviceId, registerId };
  }

  it("answers nothing for a point of sale no document was synced on", async () => {
    expect(await highestSynced(61)).toBeNull();
  });

  it("answers the highest number among the documents applied", async () => {
    for (const number of [5, 9, 7]) {
      await insertAppliedOfflineDocument(db, registerId, { pointOfSale: 62, number });
    }

    expect(await highestSynced(62)).toBe(9);
  });

  it("counts a document received and not yet applied", async () => {
    const origin = await installation();
    await insertAppliedOfflineDocument(db, registerId, { pointOfSale: 63, number: 9 });
    await insertReceivedOfflineDocumentEvent(db, origin, { pointOfSale: 63, number: 14 });

    expect(await highestSynced(63)).toBe(14);
  });

  it.each([
    ["quarantined", { quarantinedAt: NOON }],
    ["retried later", { attempts: 3, nextAttemptAt: NOON, lastError: "the sale is not applied" }],
  ])("counts a document received and %s", async (_case, state) => {
    const origin = await installation();
    await insertReceivedOfflineDocumentEvent(db, origin, { pointOfSale: 64, number: 21 }, state);

    expect(await highestSynced(64)).toBe(21);
  });

  it("ignores a received event once it was applied, since its document is then recorded", async () => {
    const origin = await installation();
    await insertReceivedOfflineDocumentEvent(
      db,
      origin,
      { pointOfSale: 65, number: 500 },
      { appliedAt: NOON },
    );

    expect(await highestSynced(65)).toBeNull();
  });

  it("answers the same number for a document both recorded and still received", async () => {
    const origin = await installation();
    await insertAppliedOfflineDocument(db, registerId, { pointOfSale: 66, number: 30 });
    await insertReceivedOfflineDocumentEvent(db, origin, { pointOfSale: 66, number: 30 });

    expect(await highestSynced(66)).toBe(30);
  });

  it("keeps the numbers of one point of sale apart from another's", async () => {
    const origin = await installation();
    await insertAppliedOfflineDocument(db, registerId, { pointOfSale: 67, number: 40 });
    await insertReceivedOfflineDocumentEvent(db, origin, { pointOfSale: 67, number: 41 });
    await insertAppliedOfflineDocument(db, registerId, { pointOfSale: 68, number: 900 });
    await insertReceivedOfflineDocumentEvent(db, origin, { pointOfSale: 68, number: 901 });

    expect(await highestSynced(67)).toBe(41);
  });

  it("ignores an event of another kind and one no schema reads", async () => {
    const origin = await installation();
    await insertReceivedOfflineDocumentEvent(db, origin, { pointOfSale: 69, number: 8 });
    await insertReceivedOfflineDocumentEvent(
      db,
      origin,
      { pointOfSale: 69, number: 99 },
      { schemaVersion: 999 },
    );
    await insertReceivedOfflineDocumentEvent(
      db,
      origin,
      { pointOfSale: 69, number: 98 },
      { eventType: "sale_completed" },
    );

    expect(await highestSynced(69)).toBe(8);
  });
});

describe("the offline number block in use and its use up, on a real Postgres", () => {
  async function claimOfflinePointOfSale(pointOfSaleNumber: number) {
    const [actor] = await db.select({ id: users.id }).from(users);
    if (!actor) {
      throw new Error("test setup: the seeded user is missing");
    }
    await db
      .insert(pointOfSaleClaims)
      .values({ pointOfSaleNumber, registerId, mechanism: "offline", claimedBy: actor.id });
  }

  function recordBlock(
    pointOfSaleNumber: number,
    range: { firstNumber: number; lastNumber: number },
    status: "in_use" | "used_up",
  ) {
    return offlineStore().transaction((tx) =>
      tx.recordOfflineNumberBlock({
        pointOfSaleNumber,
        documentType: "factura_c",
        registerId,
        range,
        status,
      }),
    );
  }

  function inUse(pointOfSaleNumber: number) {
    return offlineStore().transaction((tx) =>
      tx.offlineNumberBlockInUse(pointOfSaleNumber, "factura_c"),
    );
  }

  it("answers nothing for a point of sale with no block", async () => {
    expect(await inUse(81)).toBeNull();
  });

  it("answers the block in use, and not the one used up before it", async () => {
    await claimOfflinePointOfSale(82);
    await recordBlock(82, { firstNumber: 1, lastNumber: 1000 }, "used_up");
    await recordBlock(82, { firstNumber: 1001, lastNumber: 2000 }, "in_use");

    expect(await inUse(82)).toEqual({
      pointOfSaleNumber: 82,
      documentType: "factura_c",
      registerId,
      range: { firstNumber: 1001, lastNumber: 2000 },
      status: "in_use",
    });
  });

  it("marks the block used up, raising its version and noting the change for its register", async () => {
    await claimOfflinePointOfSale(83);
    await recordBlock(83, { firstNumber: 1, lastNumber: 1000 }, "in_use");
    const block = await inUse(83);
    if (!block) {
      throw new Error("test setup: the block in use is missing");
    }

    await offlineStore().transaction((tx) => tx.markOfflineNumberBlockUsedUp(block));

    const [stored] = await db
      .select()
      .from(offlineNumberBlocks)
      .where(eq(offlineNumberBlocks.pointOfSaleNumber, 83));
    expect(stored).toMatchObject({ status: "used_up", version: 2, firstNumber: 1 });
    const logged = await db
      .select({ version: changes.version, op: changes.op, registerId: changes.registerId })
      .from(changes)
      .where(
        and(eq(changes.entity, "offline_number_block"), eq(changes.entityId, stored?.id ?? "")),
      )
      .orderBy(asc(changes.changeSeq));
    expect(logged).toEqual([
      { version: 1, op: "insert", registerId },
      { version: 2, op: "update", registerId },
    ]);
    expect(await inUse(83)).toBeNull();
  });
});
