import type { PriceListExtraction, PriceListSource } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { supplierPriceListRows, supplierPriceLists } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { supplierPriceListReadingJobs } from "./supplier-price-list-reading-task.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import { insertPriceList, insertSupplier } from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-03-10T15:00:00.000Z");
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let listId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const actorId = await insertActor(db);
  const supplierId = await insertSupplier(db, { actorId });
  listId = await insertPriceList(db, {
    supplierId,
    locationId: await seededLocationId(db),
    actorId,
  });
});

function jobsAnswering(
  extraction: PriceListExtraction,
  received: PriceListSource[] = [],
  read: () => Promise<Uint8Array | null> = async () => PDF,
) {
  return supplierPriceListReadingJobs({
    now: () => NOW,
    db,
    files: { store: async () => {}, read },
    extractor: {
      extract: async (source) => {
        received.push(source);
        return extraction;
      },
    },
  });
}

function runTask(
  jobs: ReturnType<typeof jobsAnswering>,
  payload: unknown,
  attempt: { attempts: number; max_attempts: number } = { attempts: 1, max_attempts: 3 },
) {
  const task = jobs.taskList[SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER];
  if (!task) {
    throw new Error("test setup: expected the registered reading task");
  }
  return task(payload, buildJobHelpers(attempt).helpers);
}

async function readList() {
  const [list] = await db
    .select()
    .from(supplierPriceLists)
    .where(eq(supplierPriceLists.id, listId));
  return list;
}

function unreadableBucket(): Promise<Uint8Array | null> {
  return Promise.reject(new Error("bucket unavailable"));
}

describe("supplierPriceListReadingJobs", () => {
  it("registers the reading task and schedules nothing", () => {
    const jobs = jobsAnswering({ kind: "unavailable" });

    expect(jobs.taskList[SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.crontab).toEqual([]);
  });

  it("reads the list it is given and leaves its proposed rows for review", async () => {
    const received: PriceListSource[] = [];
    const jobs = jobsAnswering(
      {
        kind: "extracted",
        listDate: "2026-03-01",
        pricesIncludeVat: false,
        rows: [
          { description: "Yerba 1 kg", code: null, presentation: null, priceCents: 900, page: 1 },
        ],
      },
      received,
    );

    await runTask(jobs, { listId });

    const [list] = await db
      .select()
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId));
    expect(list).toMatchObject({
      state: "EXTRACTED",
      listDate: "2026-03-01",
      pricesIncludeVat: false,
      sentAt: NOW,
    });
    expect(await db.select().from(supplierPriceListRows)).toMatchObject([
      { listId, description: "Yerba 1 kg", priceCents: 900 },
    ]);
    expect(received).toEqual([{ kind: "pdf", bytes: PDF }]);
  });

  it("records that the service could not be reached without failing the job", async () => {
    await runTask(jobsAnswering({ kind: "unavailable" }), { listId });

    const [list] = await db
      .select()
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId));
    expect(list).toMatchObject({ state: "READ_FAILED", readFailure: "reading_unavailable" });
  });

  it("leaves a list whose file could not be read to the next attempt", async () => {
    const jobs = jobsAnswering({ kind: "unavailable" }, [], unreadableBucket);

    await expect(runTask(jobs, { listId }, { attempts: 2, max_attempts: 3 })).rejects.toThrow(
      "bucket unavailable",
    );

    expect(await readList()).toMatchObject({ state: "READING", sentOn: null });
  });

  it("fails a list whose file could not be read on the last attempt, without counting it as sent", async () => {
    const jobs = jobsAnswering({ kind: "unavailable" }, [], unreadableBucket);

    await expect(runTask(jobs, { listId }, { attempts: 3, max_attempts: 3 })).rejects.toThrow(
      "bucket unavailable",
    );

    expect(await readList()).toMatchObject({
      state: "READ_FAILED",
      readFailure: "reading_unavailable",
      sentOn: null,
    });
  });

  it.each([
    ["without a list", {}],
    ["with a list that is not an id", { listId: "not-an-id" }],
    ["with no payload", undefined],
  ])("refuses a job %s", async (_name, payload) => {
    await expect(runTask(jobsAnswering({ kind: "unavailable" }), payload)).rejects.toThrow();
  });
});
