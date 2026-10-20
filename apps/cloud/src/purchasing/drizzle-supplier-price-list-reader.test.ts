import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListReader } from "./drizzle-supplier-price-list-reader.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
} from "./test-support/supplier-price-list-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let supplierId: string;

const reader = () => new DrizzleSupplierPriceListReader(db);

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
  supplierId = await insertSupplier(db, { actorId, name: "Distribuidora Sur" });
});

describe("listing the supplier price lists", () => {
  it("lists every list, most recently uploaded first, whatever its state", async () => {
    const oldest = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "DISCARDED",
      uploadedAt: new Date("2026-03-01T10:00:00.000Z"),
    });
    const newest = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "READING",
      uploadedAt: new Date("2026-03-03T10:00:00.000Z"),
    });
    const middle = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "REVIEWED",
      uploadedAt: new Date("2026-03-02T10:00:00.000Z"),
    });

    const lists = await reader().lists();

    expect(lists.map(({ id }) => id)).toEqual([newest, middle, oldest]);
  });

  it("describes a list with its supplier, file, date, state, failure and counts of rows", async () => {
    const uploadedAt = new Date("2026-03-02T10:00:00.000Z");
    const confirmedAt = new Date("2026-03-04T10:00:00.000Z");
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "REVIEWED",
      fileName: "lista-marzo.pdf",
      listDate: "2026-03-01",
      uploadedAt,
      confirmedAt,
    });
    await insertPriceListRows(db, listId, [
      { priceCents: 100 },
      { priceCents: null },
      { priceCents: null },
    ]);
    const failedId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "READ_FAILED",
      readFailure: "no_items_found",
      uploadedAt: new Date("2026-03-01T10:00:00.000Z"),
    });

    const lists = await reader().lists();

    expect(lists).toEqual([
      {
        id: listId,
        supplier: { id: supplierId, name: "Distribuidora Sur" },
        sourceKind: "PDF",
        fileName: "lista-marzo.pdf",
        listDate: "2026-03-01",
        rowCount: 3,
        unpricedRowCount: 2,
        state: "REVIEWED",
        readFailure: null,
        uploadedAt,
        confirmedAt,
      },
      {
        id: failedId,
        supplier: { id: supplierId, name: "Distribuidora Sur" },
        sourceKind: "PDF",
        fileName: "lista.pdf",
        listDate: null,
        rowCount: 0,
        unpricedRowCount: 0,
        state: "READ_FAILED",
        readFailure: "no_items_found",
        uploadedAt: new Date("2026-03-01T10:00:00.000Z"),
        confirmedAt: null,
      },
    ]);
  });

  it("lists nothing when no list was uploaded", async () => {
    expect(await reader().lists()).toEqual([]);
  });
});

describe("reviewing a list", () => {
  it("answers the list with its version and its rows in the order found, each with its source page", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
      listDate: "2026-03-01",
      version: 3,
    });
    const [firstId, secondId] = await insertPriceListRows(db, listId, [
      {
        description: "Yerba 1 kg",
        code: "Y-01",
        presentation: "Caja x 10",
        priceCents: 1_500,
        page: 2,
      },
      { description: "Azúcar 1 kg", priceCents: null },
    ]);

    const review = await reader().review(listId);

    expect(review).toMatchObject({
      list: { id: listId, version: 3, state: "EXTRACTED", rowCount: 2, unpricedRowCount: 1 },
      rows: [
        {
          id: firstId,
          description: "Yerba 1 kg",
          code: "Y-01",
          presentation: "Caja x 10",
          priceCents: 1_500,
          page: 2,
        },
        {
          id: secondId,
          description: "Azúcar 1 kg",
          code: null,
          presentation: null,
          priceCents: null,
          page: null,
        },
      ],
    });
  });

  it("answers nothing for a list that does not exist", async () => {
    expect(await reader().review("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});

describe("the file name of a list", () => {
  it("answers the name the file was uploaded with", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      fileName: "lista-marzo.pdf",
    });

    expect(await reader().fileName(listId)).toBe("lista-marzo.pdf");
  });

  it("answers nothing for a list that does not exist", async () => {
    expect(await reader().fileName("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});
