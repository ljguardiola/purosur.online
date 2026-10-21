import { uploadSupplierPriceList } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  supplierPriceListExtractionCaps,
  supplierPriceListRows,
  supplierPriceLists,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertPriceList, insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-03-10T15:00:00.000Z");
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let actorId: string;
let locationId: string;
let supplierId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_price_list_store");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  await sql`delete from supplier_price_list_rows`;
  await sql`delete from supplier_price_lists`;
  await sql`delete from supplier_price_list_extraction_caps`;
  await sql`delete from graphile_worker._private_jobs`;
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
  supplierId = await insertSupplier(db, { actorId });
});

const store = () => new DrizzleSupplierPriceListStore(db, () => NOW);

const keptFiles = { store: async () => {}, read: async () => null };
const failingFiles = {
  store: async () => {
    throw new Error("the bucket refused the file");
  },
  read: async () => null,
};

function upload(files: typeof keptFiles) {
  return uploadSupplierPriceList(
    { store: store(), files },
    { supplierId, locationId, fileName: "lista.pdf", pdf: PDF, actorId, now: NOW },
  );
}

function queuedReadings() {
  return sql<{ key: string; payload: { listId: string }; maxAttempts: number }[]>`
    select j.key, j.payload, j.max_attempts as "maxAttempts"
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER}`;
}

describe("two uploads of one branch at once, on a real Postgres", () => {
  it("lets only as many through as the branch's cap allows", async () => {
    await db.insert(supplierPriceListExtractionCaps).values({ locationId, dailyCap: 1 });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (connection) =>
        connection`select id from locations where id = ${locationId} for no key update`,
      () => upload(keptFiles),
      () => upload(keptFiles),
    );

    expect(outcomes.map(({ kind }) => kind)).toEqual(["uploaded", "daily_cap_reached"]);
    expect(await db.select().from(supplierPriceLists)).toHaveLength(1);
    expect(await queuedReadings()).toHaveLength(1);
  });
});

describe("queueing the reading of an upload, on a real Postgres", () => {
  it("queues one reading of the list, keyed by the list, in the transaction that inserted it", async () => {
    const outcome = await upload(keptFiles);

    if (outcome.kind !== "uploaded") {
      throw new Error(`test setup: expected an upload, got ${outcome.kind}`);
    }
    expect(await queuedReadings()).toEqual([
      { key: outcome.listId, payload: { listId: outcome.listId }, maxAttempts: 3 },
    ]);
  });

  it("leaves neither the list nor the reading when the file cannot be stored", async () => {
    await expect(upload(failingFiles)).rejects.toThrow("the bucket refused the file");

    expect(await db.select().from(supplierPriceLists)).toEqual([]);
    expect(await queuedReadings()).toEqual([]);
  });

  it("leaves no reading when the transaction that queued it rolls back", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    await expect(
      store().transaction(async (tx) => {
        await tx.enqueueReading(listId);
        throw new Error("the transaction failed after queueing");
      }),
    ).rejects.toThrow("the transaction failed");

    expect(await queuedReadings()).toEqual([]);
  });
});

describe("recording an extraction, on a real Postgres", () => {
  it("leaves the list reading and without rows when one proposed row breaks a constraint", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    await expect(
      store().transaction((tx) =>
        tx.recordExtraction(listId, null, null, [
          { description: "Yerba 1 kg", code: null, presentation: null, priceCents: 100, page: 1 },
          { description: "Azúcar 1 kg", code: null, presentation: null, priceCents: -5, page: 1 },
        ]),
      ),
    ).rejects.toThrow();

    const [list] = await db
      .select({ state: supplierPriceLists.state, version: supplierPriceLists.version })
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId));
    expect(list).toEqual({ state: "READING", version: 1 });
    expect(await db.select().from(supplierPriceListRows)).toEqual([]);
  });
});
