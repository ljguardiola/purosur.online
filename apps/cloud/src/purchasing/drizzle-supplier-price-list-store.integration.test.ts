import {
  confirmSupplierPriceList,
  readSupplierPriceList,
  refreshSupplierPriceListWebPage,
  removeSupplierPriceListRow,
  uploadSupplierPriceList,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  supplierItemPrices,
  supplierItems,
  supplierPriceListExtractionCaps,
  supplierPriceListRemovedItems,
  supplierPriceListRereads,
  supplierPriceListRows,
  supplierPriceLists,
} from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { SUPPLIER_PRICE_LIST_READING_TASK_IDENTIFIER } from "./supplier-price-list-reading-task-identifier.js";
import { deferred } from "./test-support/deferred.js";
import { FakeSupplierPriceListWebPages } from "./test-support/fake-supplier-price-list-web-pages.js";
import { InMemorySupplierPriceListFiles } from "./test-support/in-memory-supplier-price-list-files.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertReread,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

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
  await sql`delete from supplier_item_prices`;
  await sql`delete from supplier_items`;
  await sql`delete from supplier_price_list_removed_items`;
  await sql`delete from supplier_price_list_rereads`;
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
    { zoneRules: fixedZoneRulesSource(), store: store(), files },
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
          {
            description: "Yerba 1 kg",
            code: null,
            presentation: null,
            priceCents: 100,
            page: 1,
            barcode: null,
            link: null,
          },
          {
            description: "Azúcar 1 kg",
            code: null,
            presentation: null,
            priceCents: -5,
            page: 1,
            barcode: null,
            link: null,
          },
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

describe("two confirmations of one supplier's lists at once, on a real Postgres", () => {
  async function extractedListOfANewItem() {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
      listDate: "2026-03-05",
      pricesIncludeVat: true,
    });
    await insertPriceListRows(db, listId, [{ description: "Yerba 1 kg", code: "Y-01" }]);
    return listId;
  }

  const confirm = (listId: string) =>
    confirmSupplierPriceList(store(), {
      listId,
      version: 1,
      listDate: null,
      pricesIncludeVat: null,
      actorId,
      now: NOW,
    });

  it("remembers an item both lists carry once, with the price of each list", async () => {
    const firstListId = await extractedListOfANewItem();
    const secondListId = await extractedListOfANewItem();

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (connection) =>
        connection`select id from suppliers where id = ${supplierId} for no key update`,
      () => confirm(firstListId),
      () => confirm(secondListId),
    );

    expect(outcomes.map(({ kind }) => kind)).toEqual(["confirmed", "confirmed"]);
    expect(await db.select().from(supplierItems)).toHaveLength(1);
    expect(await db.select().from(supplierItemPrices)).toHaveLength(2);
  });
});

describe("a list with at most one reread being read, on a real Postgres", () => {
  it("refuses a second reread reading of the same list and lets another list have its own", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const otherListId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    await insertReread(db, { listId, locationId, actorId });

    await expect(insertReread(db, { listId, locationId, actorId })).rejects.toThrow();
    await insertReread(db, { listId, locationId, actorId, state: "READ" });
    await insertReread(db, { listId: otherListId, locationId, actorId });

    expect(await db.select().from(supplierPriceListRereads)).toHaveLength(3);
  });
});

describe("the web page of a list, read again", () => {
  const WEB_PAGE_URL = "https://distribuidora-sur.example/lista";

  function refreshPorts() {
    return {
      zoneRules: fixedZoneRulesSource(),
      store: store(),
      files: new InMemorySupplierPriceListFiles(),
      webPages: new FakeSupplierPriceListWebPages(),
    };
  }

  const refresh = (listId: string) =>
    refreshSupplierPriceListWebPage(refreshPorts(), { listId, locationId, actorId, now: NOW });

  function webPageList(state: "EXTRACTED" | "READ_FAILED" = "EXTRACTED") {
    return insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      sourceUrl: WEB_PAGE_URL,
      state,
      ...(state === "READ_FAILED" ? { readFailure: "interrupted" as const } : {}),
      listDate: "2026-03-01",
      pricesIncludeVat: true,
    });
  }

  it("starts one reread when two refreshes of the same list arrive at once, the other finding the list already being read", async () => {
    const listId = await webPageList();

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (connection) =>
        connection`select id from locations where id = ${locationId} for no key update`,
      () => refresh(listId),
      () => refresh(listId),
    );

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["already_reading", "reread_started"]);
    expect(await db.select().from(supplierPriceListRereads)).toHaveLength(1);
    expect(await db.select().from(supplierPriceLists)).toHaveLength(1);
    expect(await queuedReadings()).toHaveLength(1);
  });

  it.each([
    ["the refresh first", "refresh", "confirm"],
    ["the confirmation first", "confirm", "refresh"],
  ] as const)(
    "never leaves a confirmed list with an open reread when a refresh and a confirmation arrive at once, %s",
    async (_order, first, second) => {
      const listId = await webPageList();
      await insertPriceListRows(db, listId, [{ description: "Yerba 1 kg", code: "Y-01" }]);
      const operations: Record<"refresh" | "confirm", () => Promise<unknown>> = {
        refresh: () => refresh(listId),
        confirm: () =>
          confirmSupplierPriceList(store(), {
            listId,
            version: 1,
            listDate: null,
            pricesIncludeVat: null,
            actorId,
            now: NOW,
          }),
      };

      await runQueuedBehindHeldLock(
        sql,
        (connection) =>
          connection`select id from supplier_price_lists where id = ${listId} for update`,
        operations[first],
        operations[second],
      );

      const [list] = await db
        .select()
        .from(supplierPriceLists)
        .where(eq(supplierPriceLists.id, listId));
      const openRereads = await db
        .select()
        .from(supplierPriceListRereads)
        .where(eq(supplierPriceListRereads.listId, listId));
      expect(list?.state === "REVIEWED" && openRereads.some((r) => r.state === "READING")).toBe(
        false,
      );
    },
  );

  it("refuses to confirm a list while its reread is being read", async () => {
    const listId = await webPageList();
    await insertPriceListRows(db, listId, [{ description: "Yerba 1 kg" }]);

    await refresh(listId);

    expect(
      await confirmSupplierPriceList(store(), {
        listId,
        version: 1,
        listDate: null,
        pricesIncludeVat: null,
        actorId,
        now: NOW,
      }),
    ).toEqual({ kind: "rereading" });
  });

  describe("merged while a person reviews the list", () => {
    async function readingWhileReviewing(
      review: (list: { listId: string; rowIds: string[] }) => Promise<unknown>,
    ) {
      const listId = await webPageList();
      const rowIds = await insertPriceListRows(db, listId, [
        { description: "Yerba 1 kg", code: "Y-01", priceCents: 900, reviewed: true },
        { description: "Azúcar 1 kg", code: "A-01", priceCents: 500 },
      ]);
      const rereadId = await insertReread(db, { listId, locationId, actorId });
      const files = new InMemorySupplierPriceListFiles();
      await files.store(rereadId, new Uint8Array([60]), "HTML");
      const answering = deferred();
      const sending = deferred();

      const read = readSupplierPriceList(
        {
          store: store(),
          files,
          storeCatalogs: { rows: async () => ({ kind: "unreadable" }) },
          zoneRules: fixedZoneRulesSource(),
          extractor: {
            extract: async () => {
              sending.resolve();
              await answering.promise;
              return {
                kind: "extracted",
                listDate: "2026-03-09",
                pricesIncludeVat: true,
                rows: [
                  {
                    description: "Yerba 1 kg",
                    code: "Y-01",
                    presentation: null,
                    priceCents: 900,
                    page: 1,
                    barcode: null,
                  },
                  {
                    description: "Azúcar 1 kg",
                    code: "A-01",
                    presentation: null,
                    priceCents: 500,
                    page: 1,
                    barcode: null,
                  },
                ],
              };
            },
          },
        },
        { listId, now: () => NOW, finalAttempt: false },
      );
      await sending.promise;
      await review({ listId, rowIds });
      answering.resolve();
      return { listId, rowIds, outcome: await read };
    }

    it("keeps a row removed while the page was being read out of the list, remembering it", async () => {
      const { listId, rowIds, outcome } = await readingWhileReviewing(
        ({ listId: reviewedListId, rowIds: [, removedId] }) =>
          removeSupplierPriceListRow(store(), {
            listId: reviewedListId,
            rowId: removedId as string,
            version: 1,
            actorId,
          }),
      );

      expect(outcome).toEqual({ kind: "extracted", rowCount: 1 });
      expect((await db.select().from(supplierPriceListRows)).map((row) => row.id)).toEqual([
        rowIds[0],
      ]);
      expect(await db.select().from(supplierPriceListRemovedItems)).toMatchObject([
        { listId, keyKind: "code", keyValue: "A-01", priceCents: 500 },
      ]);
    });

    it("answers a review action begun with the version before the merge that the list changed", async () => {
      const { listId, rowIds } = await readingWhileReviewing(async () => {});

      expect(
        await removeSupplierPriceListRow(store(), {
          listId,
          rowId: rowIds[0] as string,
          version: 1,
          actorId,
        }),
      ).toEqual({ kind: "stale_version" });
    });
  });
});
