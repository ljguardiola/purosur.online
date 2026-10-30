import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
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

function setup(webListState: "EXTRACTED" | "READ_FAILED" | "REVIEWED" | "DISCARDED" = "REVIEWED") {
  const store = new FakeSupplierPriceListStore();
  store.seedSupplier({ id: "supplier-a", name: "Distribuidora Sur", active: true });
  store.seedList({
    id: "web-list",
    sourceKind: "WEB_PAGE",
    fileName: null,
    sourceUrl: URL,
    contentKind: "HTML",
    state: webListState,
    sentOn: "2026-03-09",
  });
  store.seedList({ id: "pdf-list", state: "EXTRACTED", sentOn: "2026-03-09" });
  const files = new FakeSupplierPriceListFiles();
  const webPages = new FakeSupplierPriceListWebPages();
  webPages.answer = { kind: "read", contentKind: "HTML", bytes: HTML };
  return {
    store,
    files,
    webPages,
    ports: { store, files, webPages, zoneRules: new FakeZoneRulesSource() },
  };
}

function input(
  overrides: Partial<RefreshSupplierPriceListWebPageInput> = {},
): RefreshSupplierPriceListWebPageInput {
  return { listId: "web-list", locationId: BRANCH, actorId: "person-2", now: NOW, ...overrides };
}

describe("refreshSupplierPriceListWebPage", () => {
  it("reads the page of a confirmed list again into a new list of the same supplier, leaving the first as it was", async () => {
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
      state: "REVIEWED",
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

describe("refreshSupplierPriceListWebPage of a list not confirmed", () => {
  it.each(["EXTRACTED", "READ_FAILED"] as const)(
    "reads the page of a %s list again into that same list, leaving its rows and version as they were",
    async (state) => {
      const { store, webPages, ports } = setup(state);
      store.seedRow({ id: "row-1", listId: "web-list" });
      const before = store.snapshot();

      const outcome = await refreshSupplierPriceListWebPage(ports, input());

      expect(outcome).toEqual({ kind: "reread_started", listId: "web-list" });
      expect(webPages.urls).toEqual([URL]);
      const after = store.snapshot();
      expect(after.lists).toEqual(before.lists);
      expect(after.rows).toEqual(before.rows);
      expect(after.rereads).toEqual([
        {
          id: "reread-1",
          listId: "web-list",
          locationId: BRANCH,
          contentKind: "HTML",
          byteSize: HTML.byteLength,
          requestedAt: NOW,
          requestedBy: "person-2",
          state: "READING",
          readFailure: null,
          sentAt: null,
          sentOn: null,
        },
      ]);
      expect(after.readingQueue).toEqual(["web-list"]);
    },
  );

  it("keeps the page under the reread's id, leaving the list's own file as it was", async () => {
    const { files, ports } = setup("EXTRACTED");
    const first = new Uint8Array([1, 2, 3]);
    files.stored.set("web-list", first);
    files.contentKinds.set("web-list", "HTML");

    await refreshSupplierPriceListWebPage(ports, input());

    expect(files.stored.get("web-list")).toBe(first);
    expect(files.stored.get("reread-1")).toBe(HTML);
    expect(files.contentKinds.get("reread-1")).toBe("HTML");
    expect(files.stored.size).toBe(2);
  });

  it("keeps the kind of content the page answered, whichever the list had", async () => {
    const { webPages, files, ports } = setup("EXTRACTED");
    webPages.answer = { kind: "read", contentKind: "STORE_CATALOG", bytes: HTML };

    await refreshSupplierPriceListWebPage(ports, input());

    expect(files.contentKinds.get("reread-1")).toBe("STORE_CATALOG");
  });

  it("answers already_reading for a list that is being read, without reading the page", async () => {
    const { store, webPages, ports } = setup();
    store.seedList({
      id: "reading-list",
      sourceKind: "WEB_PAGE",
      fileName: null,
      sourceUrl: URL,
      state: "READING",
    });

    const outcome = await refreshSupplierPriceListWebPage(ports, input({ listId: "reading-list" }));

    expect(outcome).toEqual({ kind: "already_reading" });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().readingQueue).toEqual([]);
  });

  it("answers already_reading for a list with a reread being read, without reading the page", async () => {
    const { store, webPages, ports } = setup("EXTRACTED");
    store.seedReread({ id: "reread-open", listId: "web-list" });
    const before = store.snapshot();

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "already_reading" });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot()).toEqual(before);
  });

  it("reads the page again for a list whose earlier reread ended", async () => {
    const { store, ports } = setup("EXTRACTED");
    store.seedReread({
      id: "reread-failed",
      listId: "web-list",
      state: "READ_FAILED",
      readFailure: "reading_unavailable",
      sentOn: "2026-03-09",
    });

    expect(await refreshSupplierPriceListWebPage(ports, input())).toEqual({
      kind: "reread_started",
      listId: "web-list",
    });
  });

  it.each(["REVIEWED", "DISCARDED"] as const)(
    "creates a new list from a %s one, as it always did",
    async (state) => {
      const { store, ports } = setup(state);

      const outcome = await refreshSupplierPriceListWebPage(ports, input());

      expect(outcome).toEqual({ kind: "loaded", listId: "list-1" });
      expect(store.snapshot().rereads).toEqual([]);
    },
  );

  it("takes the branch quota lock before the list's, in each transaction", async () => {
    const { store, ports } = setup("EXTRACTED");

    await refreshSupplierPriceListWebPage(ports, input());

    expect(store.lockCallOrder).toEqual([
      "lockBranchExtractionQuota",
      "lockList",
      "lockBranchExtractionQuota",
      "lockList",
    ]);
  });

  it("refuses when the supplier of the list is deactivated, without reading the page", async () => {
    const { store, webPages, ports } = setup("EXTRACTED");
    store.deactivateSupplier("supplier-a");

    expect(await refreshSupplierPriceListWebPage(ports, input())).toEqual({
      kind: "supplier_inactive",
    });
    expect(webPages.urls).toEqual([]);
    expect(store.snapshot().rereads).toEqual([]);
  });

  it("counts a reread toward the cap from the moment it starts, before it is sent", async () => {
    const { store, webPages, ports } = setup("EXTRACTED");
    store.branchCaps.set(BRANCH, 1);
    store.seedList({
      id: "web-list-2",
      sourceKind: "WEB_PAGE",
      sourceUrl: URL,
      state: "EXTRACTED",
    });

    await refreshSupplierPriceListWebPage(ports, input());
    webPages.urls.length = 0;
    const outcome = await refreshSupplierPriceListWebPage(ports, input({ listId: "web-list-2" }));

    expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 1 });
    expect(webPages.urls).toEqual([]);
  });

  it("refuses once the extractions counted today, rereads included, reach the cap", async () => {
    const { store, webPages, ports } = setup("EXTRACTED");
    store.branchCaps.set(BRANCH, 1);
    store.seedList({ id: "other", state: "EXTRACTED", sentOn: "2026-03-09" });
    store.seedReread({ id: "sent", listId: "other", state: "READ", sentOn: "2026-03-10" });

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 1 });
    expect(webPages.urls).toEqual([]);
  });

  it("starts nothing when the cap is reached while the page is being read", async () => {
    const { store, files, webPages, ports } = setup("EXTRACTED");
    store.branchCaps.set(BRANCH, 1);
    webPages.onRead = async () => {
      store.seedList({ id: "elsewhere", state: "READING", sentOn: null });
    };

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 1 });
    expect(store.snapshot().rereads).toEqual([]);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it("starts a new list when the list is confirmed while the page is being read", async () => {
    const { store, webPages, ports } = setup("EXTRACTED");
    webPages.onRead = () =>
      store.transaction((tx) => tx.confirmList("web-list", "2026-03-01", true, NOW, "person-1"));

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "loaded", listId: "list-1" });
    expect(store.snapshot().rereads).toEqual([]);
  });

  it("starts a new list when the list is discarded while the page is being read", async () => {
    const { store, webPages, ports } = setup("EXTRACTED");
    webPages.onRead = () => store.transaction((tx) => tx.discardList("web-list", NOW, "person-1"));

    expect(await refreshSupplierPriceListWebPage(ports, input())).toEqual({
      kind: "loaded",
      listId: "list-1",
    });
  });

  it("answers already_reading when another reread starts while the page is being read", async () => {
    const { store, files, webPages, ports } = setup("EXTRACTED");
    webPages.onRead = async () => store.seedReread({ id: "reread-other", listId: "web-list" });
    const stored = files.stored.size;

    const outcome = await refreshSupplierPriceListWebPage(ports, input());

    expect(outcome).toEqual({ kind: "already_reading" });
    expect(store.snapshot().rereads).toHaveLength(1);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(stored);
  });

  it("leaves the list as it was when the page is refused", async () => {
    const { store, webPages, ports } = setup("EXTRACTED");
    webPages.answer = { kind: "refused", reason: SUPPLIER_PRICE_LIST_WEB_PAGE_REFUSALS[0] };
    const before = store.snapshot();

    await refreshSupplierPriceListWebPage(ports, input());

    expect(store.snapshot()).toEqual(before);
  });

  it("starts no reread when keeping the page fails", async () => {
    const { store, files, ports } = setup("EXTRACTED");
    files.storeFails = true;

    await expect(refreshSupplierPriceListWebPage(ports, input())).rejects.toThrow("store failed");

    expect(store.snapshot().rereads).toEqual([]);
    expect(store.snapshot().readingQueue).toEqual([]);
  });
});
