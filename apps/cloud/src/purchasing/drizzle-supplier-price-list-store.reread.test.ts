import { type RereadPlan, supplierItemKey } from "@purosur/domain";
import type { SupplierItemLink } from "@purosur/domain/purchasing/use-cases";
import { describe, expect, it } from "vitest";
import {
  NOW,
  supplierPriceListStoreDatabase,
} from "./test-support/drizzle-supplier-price-list-store.js";
import { insertPackaging, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertRemovedItem,
  insertReread,
} from "./test-support/supplier-price-list-fixtures.js";

const context = supplierPriceListStoreDatabase();

function extractedWebPageList(overrides: { sentAt?: Date; sentOn?: string } = {}) {
  return insertPriceList(context.db, {
    supplierId: context.supplierId,
    locationId: context.locationId,
    actorId: context.actorId,
    sourceUrl: "https://distribuidora-sur.example/lista",
    state: "EXTRACTED",
    listDate: "2026-03-01",
    pricesIncludeVat: false,
    ...overrides,
  });
}

const page = (description: string, priceCents: number | null, extra: { code?: string } = {}) => ({
  description,
  code: extra.code ?? null,
  presentation: null,
  priceCents,
  pagePriceCents: priceCents,
  page: 1,
  barcode: null,
});

describe("starting a reread", () => {
  it("records a reread reading for the requesting branch, with the file's kind and size and who asked", async () => {
    const listId = await extractedWebPageList();
    const otherBranch = await context.otherLocationId();

    const { id } = await context.store().transaction((tx) =>
      tx.startReread({
        listId,
        locationId: otherBranch,
        contentKind: "HTML",
        byteSize: 4_321,
        requestedAt: NOW,
        actorId: context.actorId,
      }),
    );

    expect(await context.rereadRow(id)).toMatchObject({
      listId,
      locationId: otherBranch,
      state: "READING",
      readFailure: null,
      fileContentKind: "HTML",
      fileByteSize: 4_321,
      requestedAt: NOW,
      requestedBy: context.actorId,
      sentAt: null,
      sentOn: null,
      finishedAt: null,
    });
  });

  it("refuses a second open reread of the same list", async () => {
    const listId = await extractedWebPageList();
    await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await expect(
      context.store().transaction((tx) =>
        tx.startReread({
          listId,
          locationId: context.locationId,
          contentKind: "HTML",
          byteSize: 1,
          requestedAt: NOW,
          actorId: context.actorId,
        }),
      ),
    ).rejects.toThrow();
  });

  it("allows a new reread once the earlier one ended", async () => {
    const listId = await extractedWebPageList();
    for (const state of ["READ", "READ_FAILED"] as const) {
      await insertReread(context.db, {
        listId,
        locationId: context.locationId,
        actorId: context.actorId,
        state,
        readFailure: state === "READ_FAILED" ? "interrupted" : null,
      });
    }

    const started = await context.store().transaction((tx) =>
      tx.startReread({
        listId,
        locationId: context.locationId,
        contentKind: "HTML",
        byteSize: 1,
        requestedAt: NOW,
        actorId: context.actorId,
      }),
    );

    expect((await context.rereadRow(started.id))?.state).toBe("READING");
  });
});

describe("the open reread of a locked list", () => {
  const lockedReread = async (listId: string) => {
    const locked = await context.store().transaction((tx) => tx.lockList(listId));
    if (locked.kind !== "locked") {
      throw new Error("test setup: the list was not found");
    }
    return locked.list.reread;
  };

  it("answers none for a list without a reread", async () => {
    expect(await lockedReread(await extractedWebPageList())).toBeNull();
  });

  it("answers the reread being read with its content kind and when it was sent", async () => {
    const listId = await extractedWebPageList();
    const id = await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
      sentAt: NOW,
      sentOn: "2026-03-10",
    });

    expect(await lockedReread(listId)).toEqual({ id, contentKind: "HTML", sentAt: NOW });
  });

  it("answers none once the reread ended, however it ended", async () => {
    const listId = await extractedWebPageList();
    await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "READ",
    });
    await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "READ_FAILED",
      readFailure: "no_items_found",
    });

    expect(await lockedReread(listId)).toBeNull();
  });
});

describe("sending and failing a reread", () => {
  it("marks it sent with the instant and the Argentina day", async () => {
    const listId = await extractedWebPageList();
    const id = await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await context.store().transaction((tx) => tx.markRereadSent(id, NOW, "2026-03-10"));

    expect(await context.rereadRow(id)).toMatchObject({ sentAt: NOW, sentOn: "2026-03-10" });
  });

  it("records why it failed and when, leaving the list's rows, state and version as they were", async () => {
    const listId = await extractedWebPageList();
    await insertPriceListRows(context.db, listId, [{ description: "Yerba 1 kg" }]);
    const id = await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await context.store().transaction((tx) => tx.recordRereadFailure(id, "no_items_found"));

    expect(await context.rereadRow(id)).toMatchObject({
      state: "READ_FAILED",
      readFailure: "no_items_found",
      finishedAt: NOW,
    });
    expect(await context.listRow(listId)).toMatchObject({ state: "EXTRACTED", version: 1 });
    expect(await context.rowsOf(listId)).toHaveLength(1);
  });
});

describe("the extractions counted on a day with rereads", () => {
  const count = (day: string, branch = context.locationId) =>
    context.store().transaction((tx) => tx.extractionsCountedOn(branch, day));

  it("counts a reread sent on that day toward the branch that asked for it", async () => {
    const listId = await extractedWebPageList();
    const otherBranch = await context.otherLocationId();
    await insertReread(context.db, {
      listId,
      locationId: otherBranch,
      actorId: context.actorId,
      state: "READ",
      sentAt: NOW,
      sentOn: "2026-03-10",
    });

    expect(await count("2026-03-10", otherBranch)).toBe(1);
    expect(await count("2026-03-10")).toBe(0);
    expect(await count("2026-03-11", otherBranch)).toBe(0);
  });

  it("counts a reread still waiting to be sent, and not one that failed before it was sent", async () => {
    const listId = await extractedWebPageList();
    await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
      state: "READ_FAILED",
      readFailure: "reading_unavailable",
    });
    expect(await count("2026-03-10")).toBe(0);

    await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
    });
    expect(await count("2026-03-10")).toBe(1);
  });
});

describe("removing a row", () => {
  it("remembers the removed item with its price among the list's removed items", async () => {
    const listId = await extractedWebPageList();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", code: "Y-01", priceCents: 900 },
    ]);

    await context
      .store()
      .transaction((tx) => tx.removeRow(listId, rowId as string, context.actorId));

    const removed = await context.store().transaction((tx) => tx.removedItems(listId));
    expect(removed).toEqual([
      {
        key: supplierItemKey({ code: "Y-01", description: "Yerba 1 kg", presentation: null }),
        priceCents: 900,
      },
    ]);
  });

  it("remembers the price the page printed for the row, not one a person typed", async () => {
    const listId = await extractedWebPageList();
    const [typedOverPrinted, typedOverNone] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", code: "Y-01", priceCents: 1_250, pagePriceCents: 900 },
      { description: "Azúcar 1 kg", code: "A-01", priceCents: 700, pagePriceCents: null },
    ]);

    for (const rowId of [typedOverPrinted, typedOverNone]) {
      await context
        .store()
        .transaction((tx) => tx.removeRow(listId, rowId as string, context.actorId));
    }

    expect(await context.store().transaction((tx) => tx.removedItems(listId))).toEqual(
      expect.arrayContaining([
        {
          key: supplierItemKey({ code: "Y-01", description: "Yerba 1 kg", presentation: null }),
          priceCents: 900,
        },
        {
          key: supplierItemKey({ code: "A-01", description: "Azúcar 1 kg", presentation: null }),
          priceCents: null,
        },
      ]),
    );
  });

  it("remembers an item without a price and one without a code by its description", async () => {
    const listId = await extractedWebPageList();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { description: "Azúcar 1 kg", presentation: "Caja x 10", priceCents: null },
    ]);

    await context
      .store()
      .transaction((tx) => tx.removeRow(listId, rowId as string, context.actorId));

    expect(await context.store().transaction((tx) => tx.removedItems(listId))).toEqual([
      {
        key: supplierItemKey({
          code: null,
          description: "Azúcar 1 kg",
          presentation: "Caja x 10",
        }),
        priceCents: null,
      },
    ]);
  });

  it("answers the removed items of the list asked about only", async () => {
    const listId = await extractedWebPageList();
    const otherListId = await extractedWebPageList();
    await insertRemovedItem(context.db, {
      listId: otherListId,
      key: { kind: "code", value: "Z-9" },
      priceCents: 5,
    });

    expect(await context.store().transaction((tx) => tx.removedItems(listId))).toEqual([]);
  });
});

describe("recording a reread", () => {
  async function linkedProduct() {
    const { id: productId } = await insertProduct(context.db, { name: "Yerba" });
    const packagingId = await insertPackaging(context.db, {
      productId,
      actorId: context.actorId,
    });
    return { productId, packagingId, vatRate: 2100 } satisfies SupplierItemLink;
  }

  async function startedReread() {
    const listId = await extractedWebPageList();
    const rereadId = await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
    });
    return { listId, rereadId };
  }

  const record = (
    listId: string,
    rereadId: string,
    plan: RereadPlan<SupplierItemLink>,
    terms: { listDate: string | null; pricesIncludeVat: boolean | null } = {
      listDate: "2026-03-09",
      pricesIncludeVat: true,
    },
  ) =>
    context
      .store()
      .transaction((tx) =>
        tx.recordReread(listId, rereadId, terms.listDate, terms.pricesIncludeVat, plan),
      );

  it("keeps the link, who made it and the review mark of a kept row, moving it to its new position and page", async () => {
    const link = await linkedProduct();
    const { listId, rereadId } = await startedReread();
    const [first, second] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 900, ...link, reviewed: true, linkedByPerson: true },
      { description: "Azúcar 1 kg", priceCents: 500, reviewed: true },
    ]);

    await record(listId, rereadId, {
      rows: [
        { kind: "kept", rowId: second as string, ...page("Azúcar 1 kg", 500) },
        { kind: "kept", rowId: first as string, ...page("Yerba 1 kg", 900), page: 2 },
      ],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([
      { id: second, position: 0, reviewed: true, productId: null, linkedByPerson: false },
      {
        id: first,
        position: 1,
        page: 2,
        reviewed: true,
        productId: link.productId,
        packagingId: link.packagingId,
        vatRate: 2100,
        linkedByPerson: true,
      },
    ]);
  });

  it("reprices a row, clearing its review mark and keeping its link", async () => {
    const link = await linkedProduct();
    const { listId, rereadId } = await startedReread();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 900, ...link, reviewed: true, linkedByPerson: true },
    ]);

    await record(listId, rereadId, {
      rows: [{ kind: "repriced", rowId: rowId as string, ...page("Yerba 1 kg", 1_100) }],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([
      {
        id: rowId,
        priceCents: 1_100,
        reviewed: false,
        productId: link.productId,
        linkedByPerson: true,
      },
    ]);
  });

  it("keeps the price a person typed on a row the page prints without one, with its link and marks", async () => {
    const link = await linkedProduct();
    const { listId, rereadId } = await startedReread();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      {
        description: "Yerba 1 kg",
        priceCents: 1_250,
        pagePriceCents: null,
        ...link,
        reviewed: true,
        linkedByPerson: true,
      },
    ]);

    await record(listId, rereadId, {
      rows: [
        {
          kind: "kept",
          rowId: rowId as string,
          ...page("Yerba 1 kg", null),
          priceCents: 1_250,
        },
      ],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([
      {
        id: rowId,
        priceCents: 1_250,
        pagePriceCents: null,
        reviewed: true,
        productId: link.productId,
        packagingId: link.packagingId,
        linkedByPerson: true,
      },
    ]);
  });

  it("keeps the price a person typed over a printed one while the page still prints that one", async () => {
    const { listId, rereadId } = await startedReread();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 1_250, pagePriceCents: 900, reviewed: true },
    ]);

    await record(listId, rereadId, {
      rows: [
        {
          kind: "kept",
          rowId: rowId as string,
          ...page("Yerba 1 kg", 900),
          priceCents: 1_250,
        },
      ],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([
      { id: rowId, priceCents: 1_250, pagePriceCents: 900, reviewed: true },
    ]);
  });

  it("gives a repriced row the page's price as its price and its page price, over a typed one", async () => {
    const { listId, rereadId } = await startedReread();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 1_250, pagePriceCents: 900, reviewed: true },
    ]);

    await record(listId, rereadId, {
      rows: [{ kind: "repriced", rowId: rowId as string, ...page("Yerba 1 kg", 1_100) }],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([
      { id: rowId, priceCents: 1_100, pagePriceCents: 1_100, reviewed: false },
    ]);
  });

  it("takes a page that newly prints no price as no price, back to review", async () => {
    const { listId, rereadId } = await startedReread();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 1_250, pagePriceCents: 900, reviewed: true },
    ]);

    await record(listId, rereadId, {
      rows: [{ kind: "repriced", rowId: rowId as string, ...page("Yerba 1 kg", null) }],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([
      { id: rowId, priceCents: null, pagePriceCents: null, reviewed: false },
    ]);
  });

  it("records the page's price as the price and the page price of an added row", async () => {
    const { listId, rereadId } = await startedReread();

    await record(listId, rereadId, {
      rows: [{ kind: "added", link: null, ...page("Yerba 1 kg", 900) }],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([{ priceCents: 900, pagePriceCents: 900 }]);
  });

  it("adds a row with the link the supplier remembered, unreviewed and not made by a person", async () => {
    const link = await linkedProduct();
    const { listId, rereadId } = await startedReread();

    await record(listId, rereadId, {
      rows: [
        { kind: "added", link, ...page("Yerba 1 kg", 900) },
        { kind: "added", link: null, ...page("Azúcar 1 kg", null) },
      ],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.rowsOf(listId)).toMatchObject([
      {
        position: 0,
        productId: link.productId,
        vatRate: 2100,
        reviewed: false,
        linkedByPerson: false,
      },
      { position: 1, productId: null, priceCents: null, reviewed: false },
    ]);
  });

  it("drops the rows whose item left the page", async () => {
    const { listId, rereadId } = await startedReread();
    const [kept, dropped] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg" },
      { description: "Azúcar 1 kg" },
    ]);

    await record(listId, rereadId, {
      rows: [{ kind: "kept", rowId: kept as string, ...page("Yerba 1 kg", 100) }],
      droppedRowIds: [dropped as string],
      remainingRemovedItems: [],
    });

    expect((await context.rowsOf(listId)).map((row) => row.id)).toEqual([kept]);
  });

  it("puts the rows of a page in the opposite order, which swaps their positions", async () => {
    const { listId, rereadId } = await startedReread();
    const ids = await insertPriceListRows(
      context.db,
      listId,
      Array.from({ length: 5 }, (_, index) => ({
        description: `Producto ${index}`,
        priceCents: 100,
      })),
    );

    await record(listId, rereadId, {
      rows: [...ids].reverse().map((rowId, index) => ({
        kind: "kept" as const,
        rowId,
        ...page(`Producto ${4 - index}`, 100),
      })),
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect((await context.rowsOf(listId)).map((row) => row.id)).toEqual([...ids].reverse());
  });

  it("replaces the removed items with the ones that remain", async () => {
    const { listId, rereadId } = await startedReread();
    await insertRemovedItem(context.db, {
      listId,
      key: { kind: "code", value: "A" },
      priceCents: 1,
    });
    await insertRemovedItem(context.db, {
      listId,
      key: { kind: "code", value: "B" },
      priceCents: null,
    });

    await record(listId, rereadId, {
      rows: [{ kind: "added", link: null, ...page("Yerba 1 kg", 100) }],
      droppedRowIds: [],
      remainingRemovedItems: [{ key: { kind: "code", value: "B" }, priceCents: null }],
    });

    expect(await context.store().transaction((tx) => tx.removedItems(listId))).toEqual([
      { key: { kind: "code", value: "B" }, priceCents: null },
    ]);
  });

  it("ends the reread as read and returns the list to extracted with its new terms and the next version", async () => {
    const { listId, rereadId } = await startedReread();
    await insertPriceListRows(context.db, listId, [{ description: "Yerba 1 kg" }]);

    await record(
      listId,
      rereadId,
      { rows: [], droppedRowIds: [], remainingRemovedItems: [] },
      { listDate: "2026-03-09", pricesIncludeVat: true },
    );

    expect(await context.rereadRow(rereadId)).toMatchObject({ state: "READ", finishedAt: NOW });
    expect(await context.listRow(listId)).toMatchObject({
      state: "EXTRACTED",
      listDate: "2026-03-09",
      pricesIncludeVat: true,
      readFailure: null,
      extractedAt: NOW,
      version: 2,
    });
  });

  it("clears the failure of a list that failed to be read when the reread succeeds", async () => {
    const listId = await insertPriceList(context.db, {
      supplierId: context.supplierId,
      locationId: context.locationId,
      actorId: context.actorId,
      sourceUrl: "https://distribuidora-sur.example/lista",
      state: "READ_FAILED",
      readFailure: "interrupted",
    });
    const rereadId = await insertReread(context.db, {
      listId,
      locationId: context.locationId,
      actorId: context.actorId,
    });

    await record(listId, rereadId, {
      rows: [{ kind: "added", link: null, ...page("Yerba 1 kg", 100) }],
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect(await context.listRow(listId)).toMatchObject({ state: "EXTRACTED", readFailure: null });
  });

  it("applies a list of nearly two thousand rows, reordered", async () => {
    const { listId, rereadId } = await startedReread();
    const count = 1_900;
    const ids = await insertPriceListRows(
      context.db,
      listId,
      Array.from({ length: count }, (_, index) => ({
        description: `Producto ${index}`,
        priceCents: 100,
      })),
    );

    await record(listId, rereadId, {
      rows: [...ids].reverse().map((rowId, index) => ({
        kind: "kept" as const,
        rowId,
        ...page(`Producto ${count - 1 - index}`, 100),
      })),
      droppedRowIds: [],
      remainingRemovedItems: [],
    });

    expect((await context.rowsOf(listId)).map((row) => row.id)).toEqual([...ids].reverse());
  });

  it("leaves the list as it was when the plan breaks a constraint", async () => {
    const { listId, rereadId } = await startedReread();
    const [rowId] = await insertPriceListRows(context.db, listId, [
      { description: "Yerba 1 kg", priceCents: 900 },
    ]);

    await expect(
      record(listId, rereadId, {
        rows: [
          { kind: "kept", rowId: rowId as string, ...page("Yerba 1 kg", 900) },
          { kind: "added", link: null, ...page("Azúcar 1 kg", -5) },
        ],
        droppedRowIds: [],
        remainingRemovedItems: [],
      }),
    ).rejects.toThrow();

    expect(await context.listRow(listId)).toMatchObject({ state: "EXTRACTED", version: 1 });
    expect((await context.rereadRow(rereadId))?.state).toBe("READING");
  });
});
