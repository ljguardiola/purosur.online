import { describe, expect, it } from "vitest";
import { SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS } from "../model/supplier-price-list-web-page.js";
import {
  type RefreshSupplierPriceListWebPageInput,
  refreshSupplierPriceListWebPage,
} from "./refresh-supplier-price-list-web-page.js";
import { FakeSupplierPriceListFiles } from "./test-support/fake-supplier-price-list-files.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";
import { FakeSupplierPriceListWebPages } from "./test-support/fake-supplier-price-list-web-pages.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const BRANCH = "branch-1";
const URL = "https://distribuidora-sur.example/lista";
const HTML = new Uint8Array([60, 104, 116, 109, 108, 62]);

function setup() {
  const store = new FakeSupplierPriceListStore();
  store.seedSupplier({ id: "supplier-a", name: "Distribuidora Sur", active: true });
  store.seedList({
    id: "web-list",
    sourceKind: "WEB_PAGE",
    fileName: null,
    sourceUrl: URL,
    contentKind: "HTML",
    state: "EXTRACTED",
    sentOn: "2026-03-09",
  });
  store.seedList({ id: "pdf-list", state: "EXTRACTED", sentOn: "2026-03-09" });
  const files = new FakeSupplierPriceListFiles();
  const webPages = new FakeSupplierPriceListWebPages();
  webPages.answer = { kind: "read", contentKind: "HTML", bytes: HTML };
  return { store, files, webPages, ports: { store, files, webPages } };
}

function input(
  overrides: Partial<RefreshSupplierPriceListWebPageInput> = {},
): RefreshSupplierPriceListWebPageInput {
  return { listId: "web-list", locationId: BRANCH, actorId: "person-2", now: NOW, ...overrides };
}

describe("refreshSupplierPriceListWebPage", () => {
  it("reads the page of the list again into a new list of the same supplier, leaving the first as it was", async () => {
    const { store, files, webPages, ports } = setup();
    const before = store.snapshot().lists;

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "loaded", listId: "list-1" });
    expect(webPages.urls).toEqual([URL]);
    const lists = store.snapshot().lists;
    expect(lists.slice(0, 2)).toEqual(before);
    expect(lists[2]).toMatchObject({
      id: "list-1",
      supplierId: "supplier-a",
      locationId: BRANCH,
      sourceKind: "WEB_PAGE",
      sourceUrl: URL,
      fileName: null,
      contentKind: "HTML",
      byteSize: HTML.byteLength,
      uploadedAt: NOW,
      uploadedBy: "person-2",
      state: "READING",
    });
    expect(files.stored.get("list-1")).toBe(HTML);
    expect(files.contentKinds.get("list-1")).toBe("HTML");
    expect(store.snapshot().readingQueue).toEqual(["list-1"]);
  });

  it("creates the new list in the branch that asks, whichever branch read the first", async () => {
    const { store, ports } = setup();
    store.seedList({
      id: "other-branch-list",
      locationId: "branch-2",
      sourceKind: "WEB_PAGE",
      fileName: null,
      sourceUrl: "https://otra.example/",
      state: "EXTRACTED",
      sentOn: "2026-03-09",
    });

    await refreshSupplierPriceListWebPage(ports, input({ listId: "other-branch-list" }));

    expect(store.snapshot().lists.at(-1)).toMatchObject({
      locationId: BRANCH,
      sourceUrl: "https://otra.example/",
    });
  });

  it("reads the page outside any transaction, taking the branch quota lock before each", async () => {
    const { store, webPages, ports } = setup();
    let openWhileReading = -1;
    webPages.onRead = async () => {
      openWhileReading = store.openTransactions;
    };

    await refreshSupplierPriceListWebPage(ports, input());

    expect(openWhileReading).toBe(0);
    expect(store.lockCallOrder).toEqual(["lockBranchExtractionQuota", "lockBranchExtractionQuota"]);
  });

  it("answers not_found for a missing list without reading any page", async () => {
    const { store, webPages, ports } = setup();

    const outcome = await refreshSupplierPriceListWebPage(ports, input({ listId: "missing" }));

    expect(outcome).toEqual({ kind: "not_found" });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().lists).toHaveLength(2);
  });

  it("answers not_a_web_page for a list that came from a PDF without reading any page", async () => {
    const { store, files, webPages, ports } = setup();

    const outcome = await refreshSupplierPriceListWebPage(ports, input({ listId: "pdf-list" }));

    expect(outcome).toEqual({ kind: "not_a_web_page" });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().lists).toHaveLength(2);
    expect(files.stored.size).toBe(0);
  });

  it("refuses when the supplier of the list is gone, without reading the page", async () => {
    const { store, webPages, ports } = setup();
    store.seedList({
      id: "orphan",
      supplierId: "missing",
      sourceKind: "WEB_PAGE",
      fileName: null,
      sourceUrl: URL,
      state: "EXTRACTED",
      sentOn: "2026-03-09",
    });

    const outcome = await refreshSupplierPriceListWebPage(ports, input({ listId: "orphan" }));

    expect(outcome).toEqual({ kind: "supplier_not_found" });
    expect(webPages.urls).toEqual([]);
  });

  it("refuses when the supplier of the list is deactivated, without reading the page", async () => {
    const { store, webPages, ports } = setup();
    store.deactivateSupplier("supplier-a");

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "supplier_inactive" });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().lists).toHaveLength(2);
  });

  it("refuses once the extractions counted today reach the cap, without reading the page", async () => {
    const { store, files, webPages, ports } = setup();
    store.branchCaps.set(BRANCH, 1);
    store.seedList({ id: "sent", state: "EXTRACTED", sentOn: "2026-03-10" });

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 1 });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it("stores and queues nothing when the cap is reached while the page is being read", async () => {
    const { store, files, webPages, ports } = setup();
    store.branchCaps.set(BRANCH, 1);
    webPages.onRead = async () => {
      store.seedList({ id: "elsewhere", state: "READING", sentOn: null });
    };

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 1 });
    expect(store.snapshot().lists).toHaveLength(3);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it.each(SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS)(
    "answers the reason %s when the page is refused, storing nothing",
    async (reason) => {
      const { store, files, webPages, ports } = setup();
      webPages.answer = { kind: "refused", reason };

      const outcome = await refreshSupplierPriceListWebPage(ports, input());

      expect(outcome).toEqual({ kind: "page_refused", reason });
      expect(store.snapshot().lists).toHaveLength(2);
      expect(store.snapshot().readingQueue).toEqual([]);
      expect(files.stored.size).toBe(0);
    },
  );
});
