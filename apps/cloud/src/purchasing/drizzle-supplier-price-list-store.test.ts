import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  supplierPriceListExtractionCaps,
  supplierPriceListRows,
  supplierPriceLists,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListStore } from "./drizzle-supplier-price-list-store.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

const NOW = new Date("2026-03-10T15:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let supplierId: string;

const store = () => new DrizzleSupplierPriceListStore(db, () => NOW);

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
  supplierId = await insertSupplier(db, { actorId });
});

async function listRow(listId: string) {
  const [row] = await db.select().from(supplierPriceLists).where(eq(supplierPriceLists.id, listId));
  return row;
}

function rowsOf(listId: string) {
  return db
    .select()
    .from(supplierPriceListRows)
    .where(eq(supplierPriceListRows.listId, listId))
    .orderBy(asc(supplierPriceListRows.position));
}

describe("the branch's extraction quota", () => {
  it("answers the default cap of ten when the branch has set none", async () => {
    const quota = await store().transaction((tx) => tx.lockBranchExtractionQuota(locationId));

    expect(quota).toEqual({ cap: 10 });
  });

  it("answers the cap the branch has set", async () => {
    await db.insert(supplierPriceListExtractionCaps).values({ locationId, dailyCap: 3 });

    const quota = await store().transaction((tx) => tx.lockBranchExtractionQuota(locationId));

    expect(quota).toEqual({ cap: 3 });
  });
});

describe("the extractions counted on a day", () => {
  const count = (day: string, branch = locationId) =>
    store().transaction((tx) => tx.extractionsCountedOn(branch, day));

  it("counts a list sent on that day whatever its outcome", async () => {
    const sentOn = "2026-03-10";
    for (const state of ["EXTRACTED", "READ_FAILED", "REVIEWED", "DISCARDED"] as const) {
      await insertPriceList(db, { supplierId, locationId, actorId, state, sentOn });
    }

    expect(await count("2026-03-10")).toBe(4);
  });

  it("counts a list still waiting to be read, because it will be sent", async () => {
    await insertPriceList(db, { supplierId, locationId, actorId, state: "READING" });

    expect(await count("2026-03-10")).toBe(1);
  });

  it("does not count a list sent on another day", async () => {
    await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
      sentOn: "2026-03-09",
    });

    expect(await count("2026-03-10")).toBe(0);
  });

  it("does not count a list that failed before it was sent", async () => {
    await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "READ_FAILED",
      readFailure: "reading_unavailable",
    });

    expect(await count("2026-03-10")).toBe(0);
  });

  it("counts a list that was sent and is still waiting for its answer on the day it was sent", async () => {
    await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "READING",
      sentAt: NOW,
      sentOn: "2026-03-10",
    });

    expect(await count("2026-03-10")).toBe(1);
    expect(await count("2026-03-11")).toBe(0);
  });

  it("counts only the lists of the branch asked about", async () => {
    await insertPriceList(db, { supplierId, locationId, actorId, state: "READING" });

    expect(await count("2026-03-10", "00000000-0000-4000-8000-000000000000")).toBe(0);
  });
});

describe("finding the supplier", () => {
  it("answers whether the supplier exists and is active", async () => {
    const inactiveId = await insertSupplier(db, { actorId, active: false });

    const [found, inactive, missing] = await store().transaction((tx) =>
      Promise.all([
        tx.findSupplier(supplierId),
        tx.findSupplier(inactiveId),
        tx.findSupplier("00000000-0000-4000-8000-000000000000"),
      ]),
    );

    expect(found).toEqual({ kind: "found", supplier: { id: supplierId, active: true } });
    expect(inactive).toEqual({ kind: "found", supplier: { id: inactiveId, active: false } });
    expect(missing).toEqual({ kind: "not_found" });
  });
});

describe("inserting and locking a list", () => {
  it("inserts a list reading, at version 1, with the file's details and who uploaded it", async () => {
    const { id } = await store().transaction((tx) =>
      tx.insertList({
        supplierId,
        locationId,
        sourceKind: "PDF",
        fileName: "lista.pdf",
        byteSize: 2_048,
        uploadedAt: NOW,
        actorId,
      }),
    );

    expect(await listRow(id)).toMatchObject({
      supplierId,
      locationId,
      sourceKind: "PDF",
      fileName: "lista.pdf",
      fileByteSize: 2_048,
      state: "READING",
      version: 1,
      uploadedAt: NOW,
      uploadedBy: actorId,
      sentAt: null,
      sentOn: null,
      listDate: null,
    });
  });

  it("locks a list with its state, version, dates and the prices of its rows in order", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
      listDate: "2026-03-01",
      pricesIncludeVat: false,
      sentAt: NOW,
      sentOn: "2026-03-10",
      version: 4,
    });
    await insertPriceListRows(db, listId, [{ priceCents: 500 }, { priceCents: null }]);

    const locked = await store().transaction((tx) => tx.lockList(listId));

    expect(locked).toEqual({
      kind: "locked",
      list: {
        id: listId,
        sourceKind: "PDF",
        state: "EXTRACTED",
        version: 4,
        listDate: "2026-03-01",
        pricesIncludeVat: false,
        sentAt: NOW,
        rowPrices: [500, null],
      },
    });
  });

  it("answers not found for a list that does not exist", async () => {
    const locked = await store().transaction((tx) =>
      tx.lockList("00000000-0000-4000-8000-000000000000"),
    );

    expect(locked).toEqual({ kind: "not_found" });
  });
});

describe("recording what the reading found", () => {
  it("marks the list sent with the instant and the Argentina day", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    await store().transaction((tx) => tx.markSent(listId, NOW, "2026-03-10"));

    expect(await listRow(listId)).toMatchObject({
      state: "READING",
      sentAt: NOW,
      sentOn: "2026-03-10",
    });
  });

  it("records the proposed rows in the order found, the list date and the instant, and advances the version", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    await store().transaction((tx) =>
      tx.recordExtraction(listId, "2026-02-27", false, [
        {
          description: "Yerba 1 kg",
          code: "Y-01",
          presentation: "Caja x 10",
          priceCents: 1_500,
          page: 1,
        },
        {
          description: "Azúcar 1 kg",
          code: null,
          presentation: null,
          priceCents: null,
          page: null,
        },
      ]),
    );

    expect(await listRow(listId)).toMatchObject({
      state: "EXTRACTED",
      listDate: "2026-02-27",
      pricesIncludeVat: false,
      extractedAt: NOW,
      readFailure: null,
      version: 2,
    });
    expect(await rowsOf(listId)).toMatchObject([
      {
        position: 0,
        description: "Yerba 1 kg",
        supplierCode: "Y-01",
        presentation: "Caja x 10",
        priceCents: 1_500,
        page: 1,
      },
      { position: 1, description: "Azúcar 1 kg", supplierCode: null, priceCents: null, page: null },
    ]);
  });

  it("records why the reading ended without rows and advances the version", async () => {
    const listId = await insertPriceList(db, { supplierId, locationId, actorId });

    await store().transaction((tx) => tx.recordReadFailure(listId, "no_items_found"));

    expect(await listRow(listId)).toMatchObject({
      state: "READ_FAILED",
      readFailure: "no_items_found",
      version: 2,
    });
  });
});

describe("reviewing the rows", () => {
  it("locks a row of the list and refuses one of another list or that does not exist", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const otherListId = await insertPriceList(db, { supplierId, locationId, actorId });
    const [rowId] = await insertPriceListRows(db, listId, [{}]);

    const [own, foreign, missing] = await store().transaction((tx) =>
      Promise.all([
        tx.lockRow(listId, rowId as string),
        tx.lockRow(otherListId, rowId as string),
        tx.lockRow(listId, "00000000-0000-4000-8000-000000000000"),
      ]),
    );

    expect(own).toEqual({ kind: "locked" });
    expect(foreign).toEqual({ kind: "not_found" });
    expect(missing).toEqual({ kind: "not_found" });
  });

  it("sets a row's price, advances the list's version and audits the change with who made it", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const [rowId] = await insertPriceListRows(db, listId, [
      { priceCents: null },
      { priceCents: 700 },
    ]);

    await store().transaction((tx) => tx.setRowPrice(listId, rowId as string, 1_250, actorId));

    expect((await rowsOf(listId)).map((row) => row.priceCents)).toEqual([1_250, 700]);
    expect((await listRow(listId))?.version).toBe(2);
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, rowId as string));
    expect(audits).toMatchObject([
      {
        entity: "supplier_price_list_row",
        actorId,
        previousValue: { priceCents: null },
        newValue: { priceCents: 1_250 },
      },
    ]);
  });

  it("removes a row, advances the list's version and audits the removal with the row it had", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const [firstId, secondId] = await insertPriceListRows(db, listId, [
      { description: "Yerba 1 kg", priceCents: 900 },
      { description: "Azúcar 1 kg" },
    ]);

    await store().transaction((tx) => tx.removeRow(listId, firstId as string, actorId));

    expect((await rowsOf(listId)).map((row) => row.id)).toEqual([secondId]);
    expect((await listRow(listId))?.version).toBe(2);
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, firstId as string));
    expect(audits).toMatchObject([
      {
        entity: "supplier_price_list_row",
        actorId,
        previousValue: { description: "Yerba 1 kg", priceCents: 900 },
        newValue: null,
      },
    ]);
  });
});

describe("closing the review", () => {
  it("confirms a list with its date, the instant and who confirmed it, and advances the version", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });

    await store().transaction((tx) => tx.confirmList(listId, "2026-03-05", false, NOW, actorId));

    expect(await listRow(listId)).toMatchObject({
      state: "REVIEWED",
      listDate: "2026-03-05",
      pricesIncludeVat: false,
      confirmedAt: NOW,
      confirmedBy: actorId,
      version: 2,
    });
  });

  it("discards a list with the instant and who discarded it, and advances the version", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });

    await store().transaction((tx) => tx.discardList(listId, NOW, actorId));

    expect(await listRow(listId)).toMatchObject({
      state: "DISCARDED",
      discardedAt: NOW,
      discardedBy: actorId,
      version: 2,
    });
  });
});
