import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSupplierPriceListReader } from "./drizzle-supplier-price-list-reader.js";
import { insertActor, insertPackaging, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertReread,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
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
        source: { kind: "PDF", fileName: "lista-marzo.pdf" },
        listDate: "2026-03-01",
        rowCount: 3,
        unpricedRowCount: 2,
        state: "REVIEWED",
        readFailure: null,
        rereading: false,
        lastRereadFailure: null,
        uploadedAt,
        confirmedAt,
      },
      {
        id: failedId,
        supplier: { id: supplierId, name: "Distribuidora Sur" },
        source: { kind: "PDF", fileName: "lista.pdf" },
        listDate: null,
        rowCount: 0,
        unpricedRowCount: 0,
        state: "READ_FAILED",
        readFailure: "no_items_found",
        rereading: false,
        lastRereadFailure: null,
        uploadedAt: new Date("2026-03-01T10:00:00.000Z"),
        confirmedAt: null,
      },
    ]);
  });

  it("describes a list read from a web page by its address", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      sourceUrl: "https://distribuidora-sur.example/lista",
    });

    const [list] = await reader().lists();

    expect(list).toMatchObject({
      id: listId,
      source: { kind: "WEB_PAGE", url: "https://distribuidora-sur.example/lista" },
    });
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
      pricesIncludeVat: false,
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
      list: {
        id: listId,
        version: 3,
        state: "EXTRACTED",
        rowCount: 2,
        unpricedRowCount: 1,
        pricesIncludeVat: false,
      },
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

  it("answers a list that does not say whether its prices include VAT as not known", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });

    expect((await reader().review(listId))?.list.pricesIncludeVat).toBeNull();
  });

  it("answers where the list came from", async () => {
    const pdfId = await insertPriceList(db, { supplierId, locationId, actorId });
    const webPageId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      sourceUrl: "https://distribuidora-sur.example/lista",
    });

    expect((await reader().review(pdfId))?.list.source).toEqual({
      kind: "PDF",
      fileName: "lista.pdf",
    });
    expect((await reader().review(webPageId))?.list.source).toEqual({
      kind: "WEB_PAGE",
      url: "https://distribuidora-sur.example/lista",
    });
  });

  it("answers nothing for a list that does not exist", async () => {
    expect(await reader().review("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});

describe("what a review says about the link and the earlier price of each row", () => {
  async function extractedList(rows: Parameters<typeof insertPriceListRows>[2]) {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
    });
    const rowIds = await insertPriceListRows(db, listId, rows);
    return { listId, rowIds };
  }

  async function confirmedList(overrides: { supplierId?: string } = {}) {
    return insertPriceList(db, {
      supplierId: overrides.supplierId ?? supplierId,
      locationId,
      actorId,
      state: "REVIEWED",
    });
  }

  it("gives each row its barcode, whether a person reviewed it and no link when it has none", async () => {
    const { listId } = await extractedList([
      { barcode: "7790000000011", reviewed: true },
      { barcode: null },
    ]);

    const review = await reader().review(listId);

    expect(review?.rows).toMatchObject([
      { barcode: "7790000000011", reviewed: true, link: null, remembered: false, earlier: null },
      { barcode: null, reviewed: false, link: null, remembered: false, earlier: null },
    ]);
  });

  it("gives a linked row its product, packaging and VAT rate", async () => {
    const { id: productId } = await insertProduct(db, {
      name: "Yerba",
      saleUnit: "UNIT",
      brandName: "Piragüé",
      netContent: { quantity: 1, unit: "KG" },
    });
    const packagingId = await insertPackaging(db, {
      productId,
      actorId,
      name: "Caja x 10",
      quantityPerPackage: 10_000,
    });
    const { listId } = await extractedList([{ productId, packagingId, vatRate: 1_050 }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.link).toEqual({
      product: {
        id: productId,
        name: "Yerba",
        brandName: "Piragüé",
        netContent: { quantity: 1, unit: "KG" },
        saleUnit: "UNIT",
      },
      packaging: {
        id: packagingId,
        name: "Caja x 10",
        quantityPerPackage: 10_000,
        active: true,
        saleUnit: "UNIT",
      },
      vatRate: 1_050,
    });
  });

  it("gives a linked product without a brand or a net content as having none", async () => {
    const { id: productId } = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const packagingId = await insertPackaging(db, { productId, actorId });
    const { listId } = await extractedList([{ productId, packagingId }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.link?.product).toEqual({
      id: productId,
      name: "Harina",
      brandName: null,
      netContent: null,
      saleUnit: "KG",
    });
  });

  it("tells whether the linked packaging is active and the sale unit it holds", async () => {
    const { id: productId } = await insertProduct(db, { name: "Harina", saleUnit: "KG" });
    const packagingId = await insertPackaging(db, {
      productId,
      actorId,
      saleUnit: "UNIT",
      active: false,
    });
    const { listId } = await extractedList([{ productId, packagingId }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.link?.packaging).toMatchObject({ active: false, saleUnit: "UNIT" });
  });

  it("gives a row the description and price the supplier's other lists last recorded for its code", async () => {
    const itemId = await insertSupplierItem(db, {
      supplierId,
      keyValue: "Y-01",
      description: "Yerba Suave 1 kg",
    });
    await insertSupplierItemPrice(db, {
      itemId,
      listId: await confirmedList(),
      priceCents: 1_400,
    });
    const { listId } = await extractedList([
      { code: "Y-01", description: "Yerba 1 kg", priceCents: 1_500 },
    ]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.earlier).toEqual({
      description: "Yerba Suave 1 kg",
      priceCents: 1_400,
    });
  });

  it("matches a row without a code by its normalized description", async () => {
    const itemId = await insertSupplierItem(db, {
      supplierId,
      keyKind: "description",
      keyValue: "azucar 1 kg",
      description: "Azúcar 1 kg",
    });
    await insertSupplierItemPrice(db, { itemId, listId: await confirmedList(), priceCents: 900 });
    const { listId } = await extractedList([{ code: null, description: "  AZÚCAR   1 Kg " }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.earlier).toEqual({ description: "Azúcar 1 kg", priceCents: 900 });
  });

  it("does not match an item of another supplier, one of the other kind or one that never had a price", async () => {
    const otherSupplierId = await insertSupplier(db, { actorId });
    const otherItemId = await insertSupplierItem(db, {
      supplierId: otherSupplierId,
      keyValue: "Y-01",
    });
    await insertSupplierItemPrice(db, {
      itemId: otherItemId,
      listId: await confirmedList({ supplierId: otherSupplierId }),
    });
    const byDescriptionId = await insertSupplierItem(db, {
      supplierId,
      keyKind: "description",
      keyValue: "Y-01",
    });
    await insertSupplierItemPrice(db, { itemId: byDescriptionId, listId: await confirmedList() });
    await insertSupplierItem(db, { supplierId, keyValue: "Z-09" });
    const { listId } = await extractedList([{ code: "Y-01" }, { code: "Z-09" }]);

    const review = await reader().review(listId);

    expect(review?.rows.map((row) => [row.remembered, row.earlier])).toEqual([
      [false, null],
      [false, null],
    ]);
  });

  it("takes the price of the latest list by date, and of the one confirmed later on a tie", async () => {
    const itemId = await insertSupplierItem(db, { supplierId, keyValue: "Y-01" });
    const prices = [
      { listDate: "2026-02-01", confirmedAt: "2026-02-02T10:00:00Z", priceCents: 100 },
      { listDate: "2026-03-01", confirmedAt: "2026-03-02T10:00:00Z", priceCents: 200 },
      { listDate: "2026-03-01", confirmedAt: "2026-03-03T10:00:00Z", priceCents: 300 },
      { listDate: "2026-01-01", confirmedAt: "2026-04-01T10:00:00Z", priceCents: 400 },
    ];
    for (const price of prices) {
      await insertSupplierItemPrice(db, {
        itemId,
        listId: await confirmedList(),
        priceCents: price.priceCents,
        listDate: price.listDate,
        confirmedAt: new Date(price.confirmedAt),
      });
    }
    const { listId } = await extractedList([{ code: "Y-01" }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.earlier?.priceCents).toBe(300);
  });

  it("takes, for a dated list, the latest price of a list dated before it and never one dated after", async () => {
    const itemId = await insertSupplierItem(db, { supplierId, keyValue: "Y-01" });
    for (const price of [
      { listDate: "2026-01-15", priceCents: 100 },
      { listDate: "2026-02-01", priceCents: 200 },
      { listDate: "2026-04-01", priceCents: 900 },
    ]) {
      await insertSupplierItemPrice(db, { itemId, listId: await confirmedList(), ...price });
    }
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
      listDate: "2026-03-01",
    });
    await insertPriceListRows(db, listId, [{ code: "Y-01" }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.earlier?.priceCents).toBe(200);
  });

  it("takes, among prices of the list's own date, only one confirmed before the list", async () => {
    const itemId = await insertSupplierItem(db, { supplierId, keyValue: "Y-01" });
    for (const price of [
      { listDate: "2026-02-01", confirmedAt: "2026-02-02T10:00:00Z", priceCents: 100 },
      { listDate: "2026-03-01", confirmedAt: "2026-03-02T09:00:00Z", priceCents: 200 },
      { listDate: "2026-03-01", confirmedAt: "2026-03-02T11:00:00Z", priceCents: 300 },
    ]) {
      await insertSupplierItemPrice(db, {
        itemId,
        listId: await confirmedList(),
        priceCents: price.priceCents,
        listDate: price.listDate,
        confirmedAt: new Date(price.confirmedAt),
      });
    }
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "REVIEWED",
      listDate: "2026-03-01",
      confirmedAt: new Date("2026-03-02T10:00:00Z"),
    });
    await insertPriceListRows(db, listId, [{ code: "Y-01" }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]?.earlier?.priceCents).toBe(200);
  });

  it("gives no earlier price when every other list is dated after the list", async () => {
    const itemId = await insertSupplierItem(db, { supplierId, keyValue: "Y-01" });
    await insertSupplierItemPrice(db, {
      itemId,
      listId: await confirmedList(),
      listDate: "2026-04-01",
    });
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      state: "EXTRACTED",
      listDate: "2026-03-01",
    });
    await insertPriceListRows(db, listId, [{ code: "Y-01" }]);

    const review = await reader().review(listId);

    expect(review?.rows[0]).toMatchObject({ remembered: true, earlier: null });
  });

  it("leaves out the price the list itself recorded", async () => {
    const itemId = await insertSupplierItem(db, { supplierId, keyValue: "Y-01" });
    const olderListId = await confirmedList();
    await insertSupplierItemPrice(db, {
      itemId,
      listId: olderListId,
      priceCents: 100,
      listDate: "2026-02-01",
    });
    const listId = await confirmedList();
    await insertPriceListRows(db, listId, [{ code: "Y-01" }]);
    await insertSupplierItemPrice(db, {
      itemId,
      listId,
      priceCents: 500,
      listDate: "2026-03-01",
    });

    const review = await reader().review(listId);

    expect(review?.rows[0]?.earlier?.priceCents).toBe(100);
  });

  it("tells a remembered item from one only the list itself recorded", async () => {
    const rememberedId = await insertSupplierItem(db, { supplierId, keyValue: "Y-01" });
    await insertSupplierItemPrice(db, {
      itemId: rememberedId,
      listId: await confirmedList(),
      listDate: "2026-02-01",
    });
    const onlyHereId = await insertSupplierItem(db, { supplierId, keyValue: "Z-09" });
    const listId = await confirmedList();
    await insertPriceListRows(db, listId, [{ code: "Y-01" }, { code: "Z-09" }]);
    for (const itemId of [rememberedId, onlyHereId]) {
      await insertSupplierItemPrice(db, { itemId, listId, listDate: "2026-03-01" });
    }

    const review = await reader().review(listId);

    expect(review?.rows.map((row) => row.remembered)).toEqual([true, false]);
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

  it("answers nothing for a list read from a web page", async () => {
    const listId = await insertPriceList(db, {
      supplierId,
      locationId,
      actorId,
      sourceUrl: "https://distribuidora-sur.example/lista",
    });

    expect(await reader().fileName(listId)).toBeUndefined();
  });

  it("answers nothing for a list that does not exist", async () => {
    expect(await reader().fileName("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});

describe("the rereads of a list", () => {
  const reread = (
    listId: string,
    requestedAt: string,
    state: "READING" | "READ" | "READ_FAILED",
    readFailure: "no_items_found" | "interrupted" | null = null,
  ) =>
    insertReread(db, {
      listId,
      locationId,
      actorId,
      state,
      readFailure,
      requestedAt: new Date(requestedAt),
    });

  async function listed(listId: string) {
    const lists = await reader().lists();
    const review = await reader().review(listId);
    const fromList = lists.find(({ id }) => id === listId);
    return {
      list: { rereading: fromList?.rereading, lastRereadFailure: fromList?.lastRereadFailure },
      review: {
        rereading: review?.list.rereading,
        lastRereadFailure: review?.list.lastRereadFailure,
      },
    };
  }

  const extractedList = () =>
    insertPriceList(db, { supplierId, locationId, actorId, state: "EXTRACTED" });

  it("is not being read again, with no failure, for a list that was never read again", async () => {
    const listId = await extractedList();

    expect(await listed(listId)).toEqual({
      list: { rereading: false, lastRereadFailure: null },
      review: { rereading: false, lastRereadFailure: null },
    });
  });

  it("is being read again while a reread is being read, with no failure", async () => {
    const listId = await extractedList();
    await reread(listId, "2026-03-02T10:00:00.000Z", "READING");

    expect(await listed(listId)).toEqual({
      list: { rereading: true, lastRereadFailure: null },
      review: { rereading: true, lastRereadFailure: null },
    });
  });

  it("answers why the latest reread failed once it did", async () => {
    const listId = await extractedList();
    await reread(listId, "2026-03-02T10:00:00.000Z", "READ_FAILED", "no_items_found");

    expect(await listed(listId)).toEqual({
      list: { rereading: false, lastRereadFailure: "no_items_found" },
      review: { rereading: false, lastRereadFailure: "no_items_found" },
    });
  });

  it("answers the failure of the latest reread only, not an earlier one", async () => {
    const listId = await extractedList();
    await reread(listId, "2026-03-02T10:00:00.000Z", "READ_FAILED", "no_items_found");
    await reread(listId, "2026-03-03T10:00:00.000Z", "READ_FAILED", "interrupted");

    expect((await listed(listId)).list.lastRereadFailure).toBe("interrupted");
  });

  it("answers no failure when a later reread was read", async () => {
    const listId = await extractedList();
    await reread(listId, "2026-03-02T10:00:00.000Z", "READ_FAILED", "no_items_found");
    await reread(listId, "2026-03-03T10:00:00.000Z", "READ");

    expect((await listed(listId)).review.lastRereadFailure).toBeNull();
  });

  it("takes the latest reread by the order they were requested in, whatever the clock said", async () => {
    const listId = await extractedList();
    await reread(listId, "2026-03-03T10:00:00.000Z", "READ_FAILED", "no_items_found");
    await reread(listId, "2026-03-02T10:00:00.000Z", "READ");

    expect((await listed(listId)).list.lastRereadFailure).toBeNull();
  });

  it("answers no failure while a reread after the failed one is being read", async () => {
    const listId = await extractedList();
    await reread(listId, "2026-03-02T10:00:00.000Z", "READ_FAILED", "no_items_found");
    await reread(listId, "2026-03-03T10:00:00.000Z", "READING");

    expect((await listed(listId)).list).toEqual({ rereading: true, lastRereadFailure: null });
  });

  it("keeps the rereads of one list from showing on another", async () => {
    const listId = await extractedList();
    const otherId = await extractedList();
    await reread(listId, "2026-03-02T10:00:00.000Z", "READING");

    expect((await listed(otherId)).list).toEqual({ rereading: false, lastRereadFailure: null });
  });
});
