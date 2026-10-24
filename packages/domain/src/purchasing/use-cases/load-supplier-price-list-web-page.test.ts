import { describe, expect, it } from "vitest";
import { SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS } from "../model/supplier-price-list-web-page.js";
import {
  type LoadSupplierPriceListWebPageInput,
  loadSupplierPriceListWebPage,
} from "./load-supplier-price-list-web-page.js";
import { FakeSupplierPriceListFiles } from "./test-support/fake-supplier-price-list-files.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";
import { FakeSupplierPriceListWebPages } from "./test-support/fake-supplier-price-list-web-pages.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const BRANCH = "branch-1";
const URL = "https://distribuidora-sur.example/lista";
const HTML = new Uint8Array([60, 104, 116, 109, 108, 62]);
const PDF = new Uint8Array([37, 80, 68, 70, 45]);

function setup() {
  const store = new FakeSupplierPriceListStore();
  store.seedSupplier({ id: "supplier-a", name: "Distribuidora Sur", active: true });
  const files = new FakeSupplierPriceListFiles();
  const webPages = new FakeSupplierPriceListWebPages();
  webPages.answer = { kind: "read", contentKind: "HTML", bytes: HTML };
  return { store, files, webPages, ports: { store, files, webPages } };
}

function input(
  overrides: Partial<LoadSupplierPriceListWebPageInput> = {},
): LoadSupplierPriceListWebPageInput {
  return {
    supplierId: "supplier-a",
    locationId: BRANCH,
    url: URL,
    actorId: "person-1",
    now: NOW,
    ...overrides,
  };
}

describe("loadSupplierPriceListWebPage", () => {
  it("records a reading list of the page, keeps the page as it was read and queues its reading", async () => {
    const { store, files, webPages, ports } = setup();

    const outcome = await loadSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "loaded", listId: "list-1" });
    expect(webPages.urls).toEqual([URL]);
    expect(store.snapshot().lists).toEqual([
      {
        id: "list-1",
        locationId: BRANCH,
        supplierId: "supplier-a",
        sourceKind: "WEB_PAGE",
        fileName: null,
        sourceUrl: URL,
        contentKind: "HTML",
        byteSize: HTML.byteLength,
        uploadedAt: NOW,
        uploadedBy: "person-1",
        state: "READING",
        version: 1,
        listDate: null,
        pricesIncludeVat: null,
        sentAt: null,
        sentOn: null,
        readFailure: null,
        confirmedAt: null,
        confirmedBy: null,
        discardedAt: null,
        discardedBy: null,
      },
    ]);
    expect(files.stored.get("list-1")).toBe(HTML);
    expect(files.contentKinds.get("list-1")).toBe("HTML");
    expect(store.snapshot().readingQueue).toEqual(["list-1"]);
  });

  it("keeps a page that turned out to be a PDF as a PDF", async () => {
    const { store, files, webPages, ports } = setup();
    webPages.answer = { kind: "read", contentKind: "PDF", bytes: PDF };

    await loadSupplierPriceListWebPage(ports, input());

    expect(store.snapshot().lists[0]).toMatchObject({
      sourceKind: "WEB_PAGE",
      sourceUrl: URL,
      contentKind: "PDF",
      byteSize: PDF.byteLength,
    });
    expect(files.contentKinds.get("list-1")).toBe("PDF");
  });

  it("reads the page outside any transaction, taking the branch quota lock before each", async () => {
    const { store, webPages, ports } = setup();
    let openWhileReading = -1;
    webPages.onRead = async () => {
      openWhileReading = store.openTransactions;
    };

    await loadSupplierPriceListWebPage(ports, input());

    expect(openWhileReading).toBe(0);
    expect(store.transactionCount).toBe(2);
    expect(store.lockCallOrder).toEqual(["lockBranchExtractionQuota", "lockBranchExtractionQuota"]);
  });

  it("refuses an unknown supplier without reading the page", async () => {
    const { store, files, webPages, ports } = setup();

    const outcome = await loadSupplierPriceListWebPage(ports, input({ supplierId: "missing" }));

    expect(outcome).toEqual({ kind: "supplier_not_found" });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().lists).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it("refuses a deactivated supplier without reading the page", async () => {
    const { store, files, webPages, ports } = setup();
    store.seedSupplier({ id: "supplier-b", name: "Cerrada", active: false });

    const outcome = await loadSupplierPriceListWebPage(ports, input({ supplierId: "supplier-b" }));

    expect(outcome).toEqual({ kind: "supplier_inactive" });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().lists).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it("refuses once the extractions counted today reach the cap, naming it, without reading the page", async () => {
    const { store, files, webPages, ports } = setup();
    store.branchCaps.set(BRANCH, 2);
    store.seedList({ id: "sent", state: "EXTRACTED", sentOn: "2026-03-10" });
    store.seedList({ id: "waiting", state: "READING", sentOn: null });

    const outcome = await loadSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 2 });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().lists).toHaveLength(2);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it("counts the day in Argentina, not in UTC", async () => {
    const { store, ports } = setup();
    store.branchCaps.set(BRANCH, 1);
    store.seedList({ id: "evening", state: "EXTRACTED", sentOn: "2026-03-10" });

    expect(
      await loadSupplierPriceListWebPage(ports, input({ now: new Date("2026-03-11T01:00:00Z") })),
    ).toEqual({ kind: "daily_cap_reached", cap: 1 });
    expect(
      (await loadSupplierPriceListWebPage(ports, input({ now: new Date("2026-03-11T04:00:00Z") })))
        .kind,
    ).toBe("loaded");
  });

  it("counts the page it loaded toward the cap", async () => {
    const { store, ports } = setup();
    store.branchCaps.set(BRANCH, 1);

    await loadSupplierPriceListWebPage(ports, input());

    expect(await loadSupplierPriceListWebPage(ports, input())).toEqual({
      kind: "daily_cap_reached",
      cap: 1,
    });
  });

  it("stores and queues nothing when the cap is reached while the page is being read", async () => {
    const { store, files, webPages, ports } = setup();
    store.branchCaps.set(BRANCH, 1);
    webPages.onRead = async () => {
      store.seedList({ id: "elsewhere", state: "READING", sentOn: null });
    };

    const outcome = await loadSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 1 });
    expect(store.snapshot().lists.map((list) => list.id)).toEqual(["elsewhere"]);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it("stores and queues nothing when the supplier is deactivated while the page is being read", async () => {
    const { store, files, webPages, ports } = setup();
    webPages.onRead = async () => {
      store.deactivateSupplier("supplier-a");
    };

    const outcome = await loadSupplierPriceListWebPage(ports, input());

    expect(outcome.kind).toBe("supplier_inactive");
    expect(store.snapshot().lists).toEqual([]);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it.each(SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS)(
    "answers the reason %s when the page is refused, storing nothing",
    async (reason) => {
      const { store, files, webPages, ports } = setup();
      webPages.answer = { kind: "refused", reason };

      const outcome = await loadSupplierPriceListWebPage(ports, input());

      expect(outcome).toEqual({ kind: "page_refused", reason });
      expect(store.snapshot().lists).toEqual([]);
      expect(store.snapshot().readingQueue).toEqual([]);
      expect(files.stored.size).toBe(0);
    },
  );

  describe("when the operation fails midway", () => {
    it("leaves no list and no queued reading when the page cannot be kept", async () => {
      const { store, files, ports } = setup();
      files.storeFails = true;

      await expect(loadSupplierPriceListWebPage(ports, input())).rejects.toThrow("store failed");

      expect(store.snapshot().lists).toEqual([]);
      expect(store.snapshot().readingQueue).toEqual([]);
    });

    it("leaves no list when queuing its reading fails", async () => {
      const { store, ports } = setup();
      store.failingWrites.add("enqueueReading");

      await expect(loadSupplierPriceListWebPage(ports, input())).rejects.toThrow(
        "enqueueReading failed",
      );

      expect(store.snapshot().lists).toEqual([]);
    });
  });
});
