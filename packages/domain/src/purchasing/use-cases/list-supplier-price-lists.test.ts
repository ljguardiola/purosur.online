import { describe, expect, it } from "vitest";
import { listSupplierPriceLists } from "./list-supplier-price-lists.js";
import type { SupplierPriceListListing } from "./supplier-price-list-reader.js";
import { FakeSupplierPriceListReader } from "./test-support/fake-supplier-price-list-reader.js";

function listing(
  overrides: Partial<SupplierPriceListListing> & { id: string },
): SupplierPriceListListing {
  return {
    supplier: { id: "supplier-a", name: "Distribuidora Sur" },
    sourceKind: "PDF",
    fileName: "lista.pdf",
    listDate: "2026-03-01",
    rowCount: 12,
    unpricedRowCount: 0,
    state: "EXTRACTED",
    readFailure: null,
    uploadedAt: new Date("2026-03-01T12:00:00Z"),
    confirmedAt: null,
    ...overrides,
  };
}

describe("listSupplierPriceLists", () => {
  it("lists every list, the most recently uploaded first, with what the screen shows", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [
        listing({ id: "old", uploadedAt: new Date("2026-03-01T12:00:00Z") }),
        listing({
          id: "new",
          supplier: { id: "supplier-b", name: "Norte" },
          fileName: "norte.pdf",
          listDate: null,
          rowCount: 0,
          unpricedRowCount: 0,
          state: "READ_FAILED",
          readFailure: "unreadable_document",
          uploadedAt: new Date("2026-03-05T12:00:00Z"),
        }),
      ],
    });

    expect(await listSupplierPriceLists(reader)).toEqual([
      {
        id: "new",
        supplier: { id: "supplier-b", name: "Norte" },
        sourceKind: "PDF",
        fileName: "norte.pdf",
        listDate: null,
        rowCount: 0,
        unpricedRowCount: 0,
        state: "READ_FAILED",
        readFailure: "unreadable_document",
        uploadedAt: new Date("2026-03-05T12:00:00Z"),
        replaced: false,
      },
      expect.objectContaining({ id: "old", state: "EXTRACTED", replaced: false }),
    ]);
  });

  it("marks a confirmed list replaced once a newer one of the same supplier is confirmed", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [
        listing({
          id: "march",
          state: "REVIEWED",
          listDate: "2026-03-01",
          confirmedAt: new Date("2026-03-02T10:00:00Z"),
          uploadedAt: new Date("2026-03-01T12:00:00Z"),
        }),
        listing({
          id: "april",
          state: "REVIEWED",
          listDate: "2026-04-01",
          confirmedAt: new Date("2026-04-02T10:00:00Z"),
          uploadedAt: new Date("2026-04-01T12:00:00Z"),
        }),
      ],
    });

    const lists = await listSupplierPriceLists(reader);

    expect(lists.map((list) => [list.id, list.replaced])).toEqual([
      ["april", false],
      ["march", true],
    ]);
  });

  it("keeps the newer list by its date current even when it was confirmed first", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [
        listing({
          id: "newer-date",
          state: "REVIEWED",
          listDate: "2026-04-01",
          confirmedAt: new Date("2026-04-02T10:00:00Z"),
          uploadedAt: new Date("2026-04-01T12:00:00Z"),
        }),
        listing({
          id: "older-date",
          state: "REVIEWED",
          listDate: "2026-03-01",
          confirmedAt: new Date("2026-05-02T10:00:00Z"),
          uploadedAt: new Date("2026-05-01T12:00:00Z"),
        }),
      ],
    });

    const lists = await listSupplierPriceLists(reader);

    expect(lists.map((list) => [list.id, list.replaced])).toEqual([
      ["older-date", true],
      ["newer-date", false],
    ]);
  });

  it("compares only the lists of the same supplier and ignores unconfirmed ones", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [
        listing({
          id: "sur",
          state: "REVIEWED",
          listDate: "2026-03-01",
          confirmedAt: new Date("2026-03-02T10:00:00Z"),
          uploadedAt: new Date("2026-03-01T12:00:00Z"),
        }),
        listing({
          id: "norte",
          supplier: { id: "supplier-b", name: "Norte" },
          state: "REVIEWED",
          listDate: "2026-04-01",
          confirmedAt: new Date("2026-04-02T10:00:00Z"),
          uploadedAt: new Date("2026-04-01T12:00:00Z"),
        }),
        listing({
          id: "discarded",
          state: "DISCARDED",
          listDate: "2026-05-01",
          uploadedAt: new Date("2026-05-01T12:00:00Z"),
        }),
        listing({
          id: "extracted",
          state: "EXTRACTED",
          listDate: "2026-06-01",
          uploadedAt: new Date("2026-06-01T12:00:00Z"),
        }),
      ],
    });

    const lists = await listSupplierPriceLists(reader);

    expect(lists.map((list) => [list.id, list.replaced])).toEqual([
      ["extracted", false],
      ["discarded", false],
      ["norte", false],
      ["sur", false],
    ]);
  });
});
