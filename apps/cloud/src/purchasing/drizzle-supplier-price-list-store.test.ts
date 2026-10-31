import type { AiCallRecord } from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  auditLog,
  productPackagings,
  supplierItemPrices,
  supplierItems,
  supplierPriceListAiCalls,
  supplierPriceListExtractionCaps,
  supplierPriceListRows,
} from "../platform/db/schema.js";
import {
  NOW,
  supplierPriceListStoreDatabase,
} from "./test-support/drizzle-supplier-price-list-store.js";
import { insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
} from "./test-support/supplier-price-list-fixtures.js";

const context = supplierPriceListStoreDatabase();

async function packagingOf(productId: string) {
  const [packaging] = await context.db
    .insert(productPackagings)
    .values({
      productId,
      name: "Caja x12",
      quantityPerPackage: 12_000,
      saleUnit: "UNIT",
      actorId: context.actorId,
    })
    .returning({ id: productPackagings.id });
  return packaging?.id ?? "";
}

describe("the branch's extraction quota", () => {
  it("answers the default cap of ten when the branch has set none", async () => {
    const quota = await context
      .store()
      .transaction((tx) => tx.lockBranchExtractionQuota(context.locationId));

    expect(quota).toEqual({ cap: 10 });
  });

  it("answers the cap the branch has set", async () => {
    await context.db
      .insert(supplierPriceListExtractionCaps)
      .values({ locationId: context.locationId, dailyCap: 3 });

    const quota = await context
      .store()
      .transaction((tx) => tx.lockBranchExtractionQuota(context.locationId));

    expect(quota).toEqual({ cap: 3 });
  });
});

describe("the extractions counted on a day", () => {
  const count = (day: string, branch = context.locationId) =>
    context.store().transaction((tx) => tx.extractionsCountedOn(branch, day));

  it("counts a list sent on that day whatever its outcome", async () => {
    const sentOn = "2026-03-10";
    for (const state of ["EXTRACTED", "READ_FAILED", "REVIEWED", "DISCARDED"] as const) {
      await insertPriceList(context.db, {
        supplierId: context.supplierId,
        locationId: context.locationId,
        actorId: context.actorId,
        state,
        sentOn,
      });
    }

    expect(await count("2026-03-10")).toBe(4);
  });

  it("counts a list still waiting to be read, because it will be sent", async () => {
    await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "READING",
    });

    expect(await count("2026-03-10")).toBe(1);
  });

  it("does not count a list sent on another day", async () => {
    await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
      sentOn: "2026-03-09",
    });

    expect(await count("2026-03-10")).toBe(0);
  });

  it("does not count a list that failed before it was sent", async () => {
    await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "READ_FAILED",
      readFailure: "reading_unavailable",
    });

    expect(await count("2026-03-10")).toBe(0);
  });

  it("counts a list that was sent and is still waiting for its answer on the day it was sent", async () => {
    await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "READING",
      sentAt: NOW,
      sentOn: "2026-03-10",
    });

    expect(await count("2026-03-10")).toBe(1);
    expect(await count("2026-03-11")).toBe(0);
  });

  it("counts only the lists of the branch asked about", async () => {
    await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "READING",
    });

    expect(await count("2026-03-10", "00000000-0000-4000-8000-000000000000")).toBe(0);
  });
});

describe("finding the supplier", () => {
  it("answers whether the supplier exists and is active", async () => {
    const inactiveId = await insertSupplier(context.db, {
      actorId: context.actorId,
      active: false,
    });

    const [found, inactive, missing] = await context
      .store()
      .transaction((tx) =>
        Promise.all([
          tx.findSupplier(context.supplierId),
          tx.findSupplier(inactiveId),
          tx.findSupplier("00000000-0000-4000-8000-000000000000"),
        ]),
      );

    expect(found).toEqual({ kind: "found", supplier: { id: context.supplierId, active: true } });
    expect(inactive).toEqual({ kind: "found", supplier: { id: inactiveId, active: false } });
    expect(missing).toEqual({ kind: "not_found" });
  });
});

describe("inserting and locking a list", () => {
  it("inserts a list reading, at version 1, with the file's details and who uploaded it", async () => {
    const { id } = await context.store().transaction((tx) =>
      tx.insertList({
        supplierId: context.supplierId,
        locationId: context.locationId,
        sourceKind: "PDF",
        fileName: "lista.pdf",
        contentKind: "PDF",
        byteSize: 2_048,
        uploadedAt: NOW,
        actorId: context.actorId,
      }),
    );

    expect(await context.listRow(id)).toMatchObject({
      supplierId: context.supplierId,
      locationId: context.locationId,
      sourceKind: "PDF",
      fileName: "lista.pdf",
      sourceUrl: null,
      fileContentKind: "PDF",
      fileByteSize: 2_048,
      state: "READING",
      version: 1,
      uploadedAt: NOW,
      uploadedBy: context.actorId,
      sentAt: null,
      sentOn: null,
      listDate: null,
    });
  });

  it("inserts a list read from a web page with its address and the kind of page kept", async () => {
    const { id } = await context.store().transaction((tx) =>
      tx.insertList({
        supplierId: context.supplierId,
        locationId: context.locationId,
        sourceKind: "WEB_PAGE",
        sourceUrl: "https://distribuidora-sur.example/lista",
        contentKind: "HTML",
        byteSize: 4_096,
        uploadedAt: NOW,
        actorId: context.actorId,
      }),
    );

    expect(await context.listRow(id)).toMatchObject({
      sourceKind: "WEB_PAGE",
      fileName: null,
      sourceUrl: "https://distribuidora-sur.example/lista",
      fileContentKind: "HTML",
      fileByteSize: 4_096,
      state: "READING",
      version: 1,
    });
  });

  it("finds where a list came from: a file, or the address of a web page", async () => {
    const pdfId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });
    const webPageId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      sourceUrl: "https://distribuidora-sur.example/lista",
    });

    const [pdf, webPage, missing] = await context
      .store()
      .transaction((tx) =>
        Promise.all([
          tx.findListSource(pdfId),
          tx.findListSource(webPageId),
          tx.findListSource("00000000-0000-4000-8000-000000000000"),
        ]),
      );

    expect(pdf).toEqual({ kind: "found", supplierId: context.supplierId, source: { kind: "PDF" } });
    expect(webPage).toEqual({
      kind: "found",
      supplierId: context.supplierId,
      source: { kind: "WEB_PAGE", url: "https://distribuidora-sur.example/lista" },
    });
    expect(missing).toEqual({ kind: "not_found" });
  });

  it("locks a list with its state, version, dates and the prices of its rows in order", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
      listDate: "2026-03-01",
      pricesIncludeVat: false,
      sentAt: NOW,
      sentOn: "2026-03-10",
      version: 4,
    });
    await insertPriceListRows(context.db, listId, [{ priceCents: 500 }, { priceCents: null }]);

    const locked = await context.store().transaction((tx) => tx.lockList(listId));

    expect(locked).toEqual({
      kind: "locked",
      list: {
        id: listId,
        supplierId: context.supplierId,
        sourceKind: "PDF",
        contentKind: "PDF",
        state: "EXTRACTED",
        version: 4,
        listDate: "2026-03-01",
        pricesIncludeVat: false,
        sentAt: NOW,
        actorId: context.actorId,
        reread: null,
        rowPrices: [500, null],
      },
    });
  });

  it("locks a list read from a web page with the kind of content kept for it", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      sourceUrl: "https://distribuidora-sur.example/lista",
      contentKind: "HTML",
    });

    const locked = await context.store().transaction((tx) => tx.lockList(listId));

    expect(locked).toMatchObject({
      kind: "locked",
      list: { sourceKind: "WEB_PAGE", contentKind: "HTML" },
    });
  });

  it("answers not found for a list that does not exist", async () => {
    const locked = await context
      .store()
      .transaction((tx) => tx.lockList("00000000-0000-4000-8000-000000000000"));

    expect(locked).toEqual({ kind: "not_found" });
  });
});

describe("recording what the reading found", () => {
  it("marks the list sent with the instant and the Argentina day", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await context.store().transaction((tx) => tx.markSent(listId, NOW, "2026-03-10"));

    expect(await context.listRow(listId)).toMatchObject({
      state: "READING",
      sentAt: NOW,
      sentOn: "2026-03-10",
    });
  });

  it("records the proposed rows in the order found, the list date and the instant, and advances the version", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });
    const { id: productId } = await insertProduct(context.db, { name: "Yerba 1 kg" });

    await context.store().transaction((tx) =>
      tx.recordExtraction(listId, "2026-02-27", false, [
        {
          description: "Yerba 1 kg",
          code: "Y-01",
          presentation: "Caja x 10",
          priceCents: 1_500,
          page: 1,
          barcode: "7790000000011",
          link: {
            productId,
            quantity: 10_000,
            saleUnit: "UNIT",
            vatRate: 1_050,
            relinkRequired: false,
          },
        },
        {
          description: "Azúcar 1 kg",
          code: null,
          presentation: null,
          priceCents: null,
          page: null,
          barcode: null,
          link: null,
        },
      ]),
    );

    expect(await context.listRow(listId)).toMatchObject({
      state: "EXTRACTED",
      listDate: "2026-02-27",
      pricesIncludeVat: false,
      extractedAt: NOW,
      readFailure: null,
      version: 2,
    });
    expect(await context.rowsOf(listId)).toMatchObject([
      {
        position: 0,
        description: "Yerba 1 kg",
        supplierCode: "Y-01",
        presentation: "Caja x 10",
        priceCents: 1_500,
        pagePriceCents: 1_500,
        page: 1,
        barcode: "7790000000011",
        productId,
        quantity: 10_000,
        saleUnit: "UNIT",
        vatRate: 1_050,
        reviewed: false,
        linkedByPerson: false,
      },
      {
        position: 1,
        description: "Azúcar 1 kg",
        supplierCode: null,
        priceCents: null,
        pagePriceCents: null,
        page: null,
        barcode: null,
        productId: null,
        quantity: null,
        saleUnit: null,
        vatRate: null,
      },
    ]);
  });

  it("records why the reading ended without rows and advances the version", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await context.store().transaction((tx) => tx.recordReadFailure(listId, "no_items_found"));

    expect(await context.listRow(listId)).toMatchObject({
      state: "READ_FAILED",
      readFailure: "no_items_found",
      version: 2,
    });
  });
});

describe("reviewing the rows", () => {
  it("locks a row of the list and refuses one of another list or that does not exist", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });
    const otherListId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });
    const [rowId] = await insertPriceListRows(context.db, listId, [{ presentation: "Caja x10" }]);

    const [own, foreign, missing] = await context
      .store()
      .transaction((tx) =>
        Promise.all([
          tx.lockRow(listId, rowId as string),
          tx.lockRow(otherListId, rowId as string),
          tx.lockRow(listId, "00000000-0000-4000-8000-000000000000"),
        ]),
      );

    expect(own).toEqual({
      kind: "locked",
      row: { description: "Producto 0", code: null, presentation: "Caja x10" },
    });
    expect(foreign).toEqual({ kind: "not_found" });
    expect(missing).toEqual({ kind: "not_found" });
  });

  it("sets a row's price, advances the list's version and audits the change with who made it", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { priceCents: null },
      { priceCents: 700 },
    ]);

    await context
      .store()
      .transaction((tx) => tx.setRowPrice(listId, rowId as string, 1_250, context.actorId));

    expect((await context.rowsOf(listId)).map((row) => row.priceCents)).toEqual([1_250, 700]);
    expect((await context.listRow(listId))?.version).toBe(2);
    const audits = await context.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, rowId as string));
    expect(audits).toMatchObject([
      {
        entity: "supplier_price_list_row",
        actorId: context.actorId,
        previousValue: { priceCents: null },
        newValue: { priceCents: 1_250 },
      },
    ]);
  });

  it("removes a row, advances the list's version and audits the removal with the row it had", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });
    const [firstId, secondId] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 900 },
      { description: "Azúcar 1 kg" },
    ]);

    await context
      .store()
      .transaction((tx) => tx.removeRow(listId, firstId as string, context.actorId));

    expect((await context.rowsOf(listId)).map((row) => row.id)).toEqual([secondId]);
    expect((await context.listRow(listId))?.version).toBe(2);
    const audits = await context.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, firstId as string));
    expect(audits).toMatchObject([
      {
        entity: "supplier_price_list_row",
        actorId: context.actorId,
        previousValue: { description: "Yerba 1 kg", priceCents: 900 },
        newValue: null,
      },
    ]);
  });
});

describe("closing the review", () => {
  it("confirms a list with its date, the instant and who confirmed it, and advances the version", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });

    await context
      .store()
      .transaction((tx) => tx.confirmList(listId, "2026-03-05", false, NOW, context.actorId));

    expect(await context.listRow(listId)).toMatchObject({
      state: "REVIEWED",
      listDate: "2026-03-05",
      pricesIncludeVat: false,
      confirmedAt: NOW,
      confirmedBy: context.actorId,
      version: 2,
    });
  });

  it("discards a list with the instant and who discarded it, and advances the version", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });

    await context.store().transaction((tx) => tx.discardList(listId, NOW, context.actorId));

    expect(await context.listRow(listId)).toMatchObject({
      state: "DISCARDED",
      discardedAt: NOW,
      discardedBy: context.actorId,
      version: 2,
    });
  });
});

describe("the rows of a list", () => {
  it("lists them in the order the reading found them with their price, the link they carry and whether a person made it", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });
    const { id: productId } = await insertProduct(context.db, { name: "Yerba 1 kg" });
    const [firstId, secondId] = await insertPriceListRows(context.db, listId, [
      {
        description: "Yerba 1 kg",
        code: "Y-01",
        presentation: "Paquete",
        priceCents: 900,
        productId,
        quantity: 10_000,
        saleUnit: "UNIT",
        vatRate: 2_100,
        reviewed: true,
        linkedByPerson: true,
      },
      { description: "Azúcar 1 kg", priceCents: null, reviewed: true },
    ]);

    const rows = await context.store().transaction((tx) => tx.listRows(listId));

    expect(rows).toEqual([
      {
        id: firstId,
        description: "Yerba 1 kg",
        code: "Y-01",
        presentation: "Paquete",
        priceCents: 900,
        pagePriceCents: 900,
        link: {
          productId,
          quantity: 10_000,
          saleUnit: "UNIT",
          vatRate: 2_100,
          relinkRequired: false,
        },
        linkedByPerson: true,
      },
      {
        id: secondId,
        description: "Azúcar 1 kg",
        code: null,
        presentation: null,
        priceCents: null,
        pagePriceCents: null,
        link: null,
        linkedByPerson: false,
      },
    ]);
  });

  it("lists the price the page printed beside the one a person typed", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });
    await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 1_250, pagePriceCents: null },
    ]);

    const rows = await context.store().transaction((tx) => tx.listRows(listId));

    expect(rows).toMatchObject([{ priceCents: 1_250, pagePriceCents: null }]);
  });

  it("lists none for a list that has no rows or that does not exist", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    const [empty, missing] = await context
      .store()
      .transaction((tx) =>
        Promise.all([tx.listRows(listId), tx.listRows("00000000-0000-4000-8000-000000000000")]),
      );

    expect(empty).toEqual([]);
    expect(missing).toEqual([]);
  });
});

describe("a supplier's remembered items", () => {
  const code = (value: string) => ({ kind: "code" as const, value });
  const description = (value: string) => ({ kind: "description" as const, value });

  it.each([
    ["supplierItems", (tx: Tx, keys: Key[]) => tx.supplierItems(context.supplierId, keys)],
    ["lockSupplierItems", (tx: Tx, keys: Key[]) => tx.lockSupplierItems(context.supplierId, keys)],
  ])(
    "%s answers the items with those keys, their link and the list date of their latest price",
    async (_name, find) => {
      const { id: productId } = await insertProduct(context.db, { name: "Yerba 1 kg" });
      const olderListId = await insertPriceList(context.db, {
        supplierId: context.supplierId,
        locationId: context.locationId,
        actorId: context.actorId,
      });
      const newerListId = await insertPriceList(context.db, {
        supplierId: context.supplierId,
        locationId: context.locationId,
        actorId: context.actorId,
      });
      const linkedId = await insertSupplierItem(context.db, {
        supplierId: context.supplierId,
        keyValue: "Y-01",
        description: "Yerba 1 kg",
        productId,
        quantity: 10_000,
        saleUnit: "UNIT",
        vatRate: 1_050,
      });
      await insertSupplierItemPrice(context.db, {
        itemId: linkedId,
        listId: newerListId,
        listDate: "2026-03-05",
      });
      await insertSupplierItemPrice(context.db, {
        itemId: linkedId,
        listId: olderListId,
        listDate: "2026-02-01",
      });
      const unlinkedId = await insertSupplierItem(context.db, {
        supplierId: context.supplierId,
        keyKind: "description",
        keyValue: "azucar 1 kg",
        description: "Azúcar 1 kg",
      });

      const items = await context
        .store()
        .transaction((tx) =>
          find(tx, [code("Y-01"), description("azucar 1 kg"), code("never-seen")]),
        );

      expect(items).toEqual(
        expect.arrayContaining([
          {
            id: linkedId,
            key: code("Y-01"),
            description: "Yerba 1 kg",
            link: {
              productId,
              quantity: 10_000,
              saleUnit: "UNIT",
              vatRate: 1_050,
              relinkRequired: false,
            },
            currentListDate: "2026-03-05",
          },
          {
            id: unlinkedId,
            key: description("azucar 1 kg"),
            description: "Azúcar 1 kg",
            link: null,
            currentListDate: null,
          },
        ]),
      );
      expect(items).toHaveLength(2);
    },
  );

  it.each([
    ["supplierItems", (tx: Tx, keys: Key[]) => tx.supplierItems(context.supplierId, keys)],
    ["lockSupplierItems", (tx: Tx, keys: Key[]) => tx.lockSupplierItems(context.supplierId, keys)],
  ])(
    "%s leaves out the item of another supplier and one whose value is of the other kind",
    async (_name, find) => {
      const otherSupplierId = await insertSupplier(context.db, { actorId: context.actorId });
      await insertSupplierItem(context.db, { supplierId: otherSupplierId, keyValue: "Y-01" });
      await insertSupplierItem(context.db, {
        supplierId: context.supplierId,
        keyKind: "description",
        keyValue: "Y-01",
      });

      const items = await context.store().transaction((tx) => find(tx, [code("Y-01")]));

      expect(items).toEqual([]);
    },
  );

  it.each([
    ["supplierItems", (tx: Tx, keys: Key[]) => tx.supplierItems(context.supplierId, keys)],
    ["lockSupplierItems", (tx: Tx, keys: Key[]) => tx.lockSupplierItems(context.supplierId, keys)],
  ])("%s answers none for no keys", async (_name, find) => {
    await insertSupplierItem(context.db, { supplierId: context.supplierId });

    expect(await context.store().transaction((tx) => find(tx, []))).toEqual([]);
  });
});

type Tx = Parameters<Parameters<ReturnType<typeof context.store>["transaction"]>[0]>[0];
type Key = { kind: "code" | "description"; value: string };

describe("locking the product to link", () => {
  it("answers whether the product is active and the sale unit it is sold by", async () => {
    const { id: weighed } = await insertProduct(context.db, { name: "Harina", saleUnit: "KG" });
    const { id: inactive } = await insertProduct(context.db, { name: "Yerba", active: false });

    const [byWeight, deactivated] = await context
      .store()
      .transaction((tx) =>
        Promise.all([tx.lockLinkableProduct(weighed), tx.lockLinkableProduct(inactive)]),
      );

    expect(byWeight).toEqual({ kind: "locked", product: { active: true, saleUnit: "KG" } });
    expect(deactivated).toEqual({ kind: "locked", product: { active: false, saleUnit: "UNIT" } });
  });

  it("answers not found for a product that does not exist", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";

    expect(await context.store().transaction((tx) => tx.lockLinkableProduct(missing))).toEqual({
      kind: "not_found",
    });
  });
});

describe("remembering an item", () => {
  async function linkedTarget() {
    const { id: productId } = await insertProduct(context.db, { name: "Yerba 1 kg" });
    return { productId, quantity: 10_000, saleUnit: "UNIT" as const, relinkRequired: false };
  }

  function itemRows() {
    return context.db.select().from(supplierItems);
  }

  it("adds an item of the supplier with its key, description and link", async () => {
    const link = { ...(await linkedTarget()), vatRate: 2_100 };

    const { id } = await context.store().transaction((tx) =>
      tx.addSupplierItem({
        supplierId: context.supplierId,
        key: { kind: "description", value: "yerba 1 kg" },
        description: "Yerba 1 Kg",
        link,
      }),
    );

    expect(await itemRows()).toEqual([
      {
        id,
        supplierId: context.supplierId,
        keyKind: "description",
        keyValue: "yerba 1 kg",
        description: "Yerba 1 Kg",
        productId: link.productId,
        packagingId: null,
        quantity: 10_000,
        saleUnit: "UNIT",
        relinkRequired: false,
        vatRate: 2_100,
      },
    ]);
  });

  it("adds an item without a link", async () => {
    await context.store().transaction((tx) =>
      tx.addSupplierItem({
        supplierId: context.supplierId,
        key: { kind: "code", value: "Y-01" },
        description: "Yerba 1 kg",
        link: null,
      }),
    );

    expect(await itemRows()).toMatchObject([
      {
        keyKind: "code",
        keyValue: "Y-01",
        productId: null,
        quantity: null,
        saleUnit: null,
        vatRate: null,
      },
    ]);
  });

  it("changes the description of an item", async () => {
    const itemId = await insertSupplierItem(context.db, {
      supplierId: context.supplierId,
      description: "Yerba 1 kg",
    });

    await context.store().transaction((tx) => tx.describeSupplierItem(itemId, "Yerba Suave 1 kg"));

    expect(await itemRows()).toMatchObject([{ id: itemId, description: "Yerba Suave 1 kg" }]);
  });

  it("remembers a link for an item, replacing the one it had and dropping its VAT rate when the link has none", async () => {
    const first = await linkedTarget();
    const second = await linkedTarget();
    const itemId = await insertSupplierItem(context.db, {
      supplierId: context.supplierId,
      ...first,
      vatRate: 1_050,
    });

    await context
      .store()
      .transaction((tx) => tx.rememberSupplierItemLink(itemId, { ...second, vatRate: null }));

    expect(await itemRows()).toMatchObject([{ id: itemId, ...second, vatRate: null }]);
  });

  it("remembers a link for an item the release that links through packagings linked, leaving no packaging behind", async () => {
    const first = await linkedTarget();
    const second = await linkedTarget();
    const itemId = await insertSupplierItem(context.db, {
      supplierId: context.supplierId,
      ...first,
    });
    const packagingId = await packagingOf(first.productId);
    await context.db
      .update(supplierItems)
      .set({ packagingId })
      .where(eq(supplierItems.id, itemId));

    await context.store().transaction((tx) => tx.rememberSupplierItemLink(itemId, second));

    expect(await itemRows()).toMatchObject([{ id: itemId, ...second, packagingId: null }]);
  });

  it("records the price an item had in a list, with the list's date and VAT answer and the instant", async () => {
    const itemId = await insertSupplierItem(context.db, { supplierId: context.supplierId });
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await context.store().transaction((tx) =>
      tx.recordSupplierItemPrice({
        itemId,
        listId,
        priceCents: 1_250,
        listDate: "2026-03-05",
        pricesIncludeVat: true,
      }),
    );

    expect(await context.db.select().from(supplierItemPrices)).toEqual([
      {
        itemId,
        listId,
        priceCents: 1_250,
        listDate: "2026-03-05",
        pricesIncludeVat: true,
        confirmedAt: NOW,
      },
    ]);
  });

  it("dates the prices of a list with the instant it is confirmed at", async () => {
    const itemId = await insertSupplierItem(context.db, { supplierId: context.supplierId });
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });
    const confirmedAt = new Date("2026-03-10T15:00:00.250Z");

    await context.store().transaction(async (tx) => {
      await tx.recordSupplierItemPrice({
        itemId,
        listId,
        priceCents: 1_250,
        listDate: "2026-03-05",
        pricesIncludeVat: true,
      });
      await tx.confirmList(listId, "2026-03-05", true, confirmedAt, context.actorId);
    });

    expect(await context.db.select().from(supplierItemPrices)).toMatchObject([{ confirmedAt }]);
  });
});

describe("linking and reviewing a row", () => {
  async function target() {
    const { id: productId } = await insertProduct(context.db, { name: "Yerba 1 kg" });
    return { productId, quantity: 10_000, saleUnit: "UNIT" as const, relinkRequired: false };
  }

  async function extractedListWithARow() {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "EXTRACTED",
    });
    const [rowId] = await insertPriceListRows(context.db, listId, [{ description: "Yerba 1 kg" }]);
    return { listId, rowId: rowId as string };
  }

  it("links a row as a person's link, marks it reviewed, advances the list's version and audits the change with who made it", async () => {
    const { listId, rowId } = await extractedListWithARow();
    const link = { ...(await target()), vatRate: 1_050 };

    await context.store().transaction((tx) => tx.linkRow(listId, rowId, link, context.actorId));

    expect((await context.rowsOf(listId))[0]).toMatchObject({
      ...link,
      reviewed: true,
      linkedByPerson: true,
    });
    expect((await context.listRow(listId))?.version).toBe(2);
    expect(
      await context.db.select().from(auditLog).where(eq(auditLog.entityId, rowId)),
    ).toMatchObject([
      {
        entity: "supplier_price_list_row",
        actorId: context.actorId,
        previousValue: {
          productId: null,
          quantity: null,
          saleUnit: null,
          relinkRequired: false,
          vatRate: null,
          reviewed: false,
          linkedByPerson: false,
        },
        newValue: { ...link, reviewed: true, linkedByPerson: true },
      },
    ]);
  });

  it("audits the link a row had before it was linked again", async () => {
    const first = { ...(await target()), vatRate: 2_100 };
    const second = { ...(await target()), vatRate: null };
    const { listId, rowId } = await extractedListWithARow();
    await context.store().transaction((tx) => tx.linkRow(listId, rowId, first, context.actorId));

    await context.store().transaction((tx) => tx.linkRow(listId, rowId, second, context.actorId));

    const audits = await context.db.select().from(auditLog).where(eq(auditLog.entityId, rowId));
    expect(audits.map((audit) => audit.previousValue)).toContainEqual({
      ...first,
      reviewed: true,
      linkedByPerson: true,
    });
    expect((await context.rowsOf(listId))[0]).toMatchObject({ ...second, reviewed: true });
  });

  it("links a row the release that links through packagings linked, leaving no packaging behind", async () => {
    const first = { ...(await target()), vatRate: 2_100 };
    const second = { ...(await target()), vatRate: 2_100 };
    const { listId, rowId } = await extractedListWithARow();
    await context.store().transaction((tx) => tx.linkRow(listId, rowId, first, context.actorId));
    const packagingId = await packagingOf(first.productId);
    await context.db
      .update(supplierPriceListRows)
      .set({ packagingId })
      .where(eq(supplierPriceListRows.id, rowId));

    await context.store().transaction((tx) => tx.linkRow(listId, rowId, second, context.actorId));

    expect((await context.rowsOf(listId))[0]).toMatchObject({ ...second, packagingId: null });
  });

  it("marks a row reviewed without touching its link or making it a person's, advances the version and audits it", async () => {
    const { listId, rowId } = await extractedListWithARow();

    await context.store().transaction((tx) => tx.markRowReviewed(listId, rowId, context.actorId));

    expect((await context.rowsOf(listId))[0]).toMatchObject({
      reviewed: true,
      linkedByPerson: false,
      productId: null,
    });
    expect((await context.listRow(listId))?.version).toBe(2);
    expect(
      await context.db.select().from(auditLog).where(eq(auditLog.entityId, rowId)),
    ).toMatchObject([
      {
        entity: "supplier_price_list_row",
        actorId: context.actorId,
        previousValue: { reviewed: false },
        newValue: { reviewed: true },
      },
    ]);
  });
});

function constraintViolatedBy(error: unknown, name: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ((current as { constraint?: unknown }).constraint === name) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

describe("recording the AI calls of an operation", () => {
  const record = (overrides: Partial<AiCallRecord> & { listId: string }): AiCallRecord => ({
    purpose: "READING",
    rowId: null,
    actorId: context.actorId,
    occurredAt: NOW,
    occurredOn: "2026-03-10",
    model: "claude-sonnet-5-5",
    inputTokens: 1_000,
    outputTokens: 200,
    cacheWriteTokens: 30,
    cacheReadTokens: 40,
    outcome: "completed",
    costNanoUsd: 4_100_000,
    ...overrides,
  });

  it("writes each record with the supplier and the branch of its list", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await context
      .store()
      .transaction((tx) =>
        tx.recordAiCalls([
          record({ listId }),
          record({ listId, outcome: "cut_short", costNanoUsd: null, model: "claude-sonnet-5" }),
        ]),
      );

    const calls = await context.db.select().from(supplierPriceListAiCalls);
    expect(calls).toHaveLength(2);
    expect(calls).toContainEqual(
      expect.objectContaining({
        listId,
        rowId: null,
        purpose: "READING",
        supplierId: context.supplierId,
        locationId: context.locationId,
        actorId: context.actorId,
        occurredAt: NOW,
        occurredOn: "2026-03-10",
        model: "claude-sonnet-5-5",
        inputTokens: 1_000,
        outputTokens: 200,
        cacheWriteTokens: 30,
        cacheReadTokens: 40,
        outcome: "completed",
        costNanoUsd: 4_100_000,
      }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        outcome: "cut_short",
        costNanoUsd: null,
        model: "claude-sonnet-5",
      }),
    );
  });

  it("writes nothing when it has no record", async () => {
    await context.store().transaction((tx) => tx.recordAiCalls([]));

    expect(await context.db.select().from(supplierPriceListAiCalls)).toEqual([]);
  });

  it("keeps a record of a row after the row is removed from its list", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });
    await insertPriceListRows(context.db, listId, [{}]);
    const [row] = await context.rowsOf(listId);
    await context
      .store()
      .transaction((tx) =>
        tx.recordAiCalls([record({ listId, purpose: "LINK_PROPOSAL", rowId: row?.id ?? "" })]),
      );

    await context.store().transaction((tx) => tx.removeRow(listId, row?.id ?? "", context.actorId));

    expect(await context.db.select().from(supplierPriceListAiCalls)).toHaveLength(1);
  });

  it("refuses records of a list that does not exist", async () => {
    await expect(
      context
        .store()
        .transaction((tx) =>
          tx.recordAiCalls([record({ listId: "00000000-0000-4000-8000-000000000000" })]),
        ),
    ).rejects.toThrow();
  });

  it.each([
    ["an unknown purpose", { purpose: "SUMMARY" }, "supplier_price_list_ai_calls_purpose_check"],
    ["an unknown outcome", { outcome: "timed_out" }, "supplier_price_list_ai_calls_outcome_check"],
    [
      "a reading made for a row",
      { purpose: "READING", rowId: "00000000-0000-4000-8000-000000000001" },
      "supplier_price_list_ai_calls_purpose_row_check",
    ],
    ["a negative token count", { inputTokens: -1 }, "supplier_price_list_ai_calls_tokens_check"],
    ["a negative cost", { costNanoUsd: -1 }, "supplier_price_list_ai_calls_cost_check"],
  ] as const)("refuses %s", async (_name, overrides, constraint) => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await expect(
      context.db.insert(supplierPriceListAiCalls).values({
        ...record({ listId }),
        supplierId: context.supplierId,
        locationId: context.locationId,
        ...overrides,
      }),
    ).rejects.toSatisfy((error) => constraintViolatedBy(error, constraint));
  });

  it("writes no record when its transaction fails after recording", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await expect(
      context.store().transaction(async (tx) => {
        await tx.recordAiCalls([record({ listId })]);
        throw new Error("fails after recording");
      }),
    ).rejects.toThrow("fails after recording");

    expect(await context.db.select().from(supplierPriceListAiCalls)).toEqual([]);
  });
});
