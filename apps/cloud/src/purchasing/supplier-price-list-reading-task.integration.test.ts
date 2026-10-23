import type { PriceListSource } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierPriceLists } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { supplierPriceListReadingJobs } from "./supplier-price-list-reading-task.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertPriceList, insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-03-10T15:00:00.000Z");
const THIRTY_MINUTES_AGO = new Date("2026-03-10T14:30:00.000Z");
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let admin: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let actorId: string;
let locationId: string;
let supplierId: string;
let received: PriceListSource[];

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("supplier_price_list_reading_task");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  admin = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
  await integrationDb.close();
});

beforeEach(async () => {
  await sql`delete from supplier_price_list_rows`;
  await sql`delete from supplier_price_lists`;
  await sql`delete from graphile_worker._private_jobs`;
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
  supplierId = await insertSupplier(db, { actorId });
  received = [];
});

function jobs() {
  return supplierPriceListReadingJobs({
    now: () => NOW,
    db,
    files: { store: async () => {}, read: async () => PDF },
    extractor: {
      extract: async (source) => {
        received.push(source);
        return { kind: "unavailable" };
      },
    },
  });
}

function runTask(identifier: string, payload: unknown, attempts = 1) {
  const task = jobs().taskList[identifier];
  if (!task) {
    throw new Error(`test setup: expected the registered task ${identifier}`);
  }
  return task(payload, buildJobHelpers({ attempts, max_attempts: 3 }).helpers);
}

async function queueReading(listId: string): Promise<void> {
  await new DrizzleSupplierPriceListStore(db, () => NOW).transaction((tx) =>
    tx.enqueueReading(listId),
  );
}

async function lockReadingJobByStoppedWorker(listId: string, lockedAt: Date): Promise<void> {
  await admin`update graphile_worker._private_jobs
    set locked_at = ${lockedAt}, locked_by = 'worker-of-a-stopped-cloud'
    where key = ${listId}`;
}

async function readList(listId: string) {
  const [list] = await db
    .select()
    .from(supplierPriceLists)
    .where(eq(supplierPriceLists.id, listId));
  return list;
}

describe("supplierPriceListReadingJobs against a real job queue", () => {
  it("fails as interrupted a list a stopped cloud left sent and locked, and its late retry never sends it again", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      sentAt: THIRTY_MINUTES_AGO,
      sentOn: "2026-03-10",
    });
    await queueReading(listId);
    await lockReadingJobByStoppedWorker(listId, THIRTY_MINUTES_AGO);

    await runTask("supplier-price-list-abandoned-reading-check", {});

    expect(await readList(listId)).toMatchObject({
      state: "READ_FAILED",
      readFailure: "interrupted",
    });

    await runTask(SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER, { listId }, 2);

    expect(received).toEqual([]);
    expect(await readList(listId)).toMatchObject({
      state: "READ_FAILED",
      readFailure: "interrupted",
    });
  });
});
