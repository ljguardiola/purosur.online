import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { SupplierPriceListReadFailure } from "../model/supplier-price-list.js";
import type { PriceListExtraction } from "./price-list-extractor.js";
import { readSupplierPriceList } from "./read-supplier-price-list.js";
import { removeSupplierPriceListRow } from "./remove-supplier-price-list-row.js";
import { setSupplierPriceListRowPrice } from "./set-supplier-price-list-row-price.js";
import {
  aUsage,
  HTML,
  readInput as input,
  NOW,
  readingContext,
  SENT_ON,
} from "./test-support/read-supplier-price-list.js";

const FIRST_SENT_AT = new Date("2026-03-01T15:00:00Z");
const LINK = {
  productId: "product-1",
  quantity: 1_000,
  saleUnit: "UNIT" as const,
  vatRate: null,
  relinkRequired: false,
};
const OTHER_LINK = {
  productId: "product-2",
  quantity: 1_000,
  saleUnit: "UNIT" as const,
  vatRate: 2100,
  relinkRequired: false,
};

function pageRow(description: string, priceCents: number | null, overrides = {}) {
  return {
    description,
    code: null,
    presentation: null,
    priceCents,
    page: null,
    barcode: null,
    ...overrides,
  };
}

function extracted(
  rows: ReturnType<typeof pageRow>[],
  terms: { listDate?: string | null; pricesIncludeVat?: boolean | null } = {},
): PriceListExtraction {
  return {
    kind: "extracted",
    listDate: terms.listDate === undefined ? "2026-03-10" : terms.listDate,
    pricesIncludeVat: terms.pricesIncludeVat === undefined ? true : terms.pricesIncludeVat,
    rows,
  };
}

function setup(listState: "EXTRACTED" | "READ_FAILED" | "DISCARDED" = "EXTRACTED") {
  const { store, files, extractor, storeCatalogs, ports } = readingContext(
    new FakeZoneRulesSource(),
  );
  store.seedList({
    id: "list-1",
    sourceKind: "WEB_PAGE",
    fileName: null,
    sourceUrl: "https://distribuidora-sur.example/lista",
    contentKind: "HTML",
    state: listState,
    listDate: "2026-03-01",
    pricesIncludeVat: false,
    sentAt: FIRST_SENT_AT,
    sentOn: "2026-03-01",
    uploadedBy: "person-7",
    version: 5,
  });
  store.seedReread({ id: "reread-1", listId: "list-1", contentKind: "HTML" });
  files.stored.set("list-1", new Uint8Array([1]));
  files.contentKinds.set("list-1", "HTML");
  files.stored.set("reread-1", HTML);
  files.contentKinds.set("reread-1", "HTML");
  return { store, files, extractor, storeCatalogs, ports };
}

function withoutRereads<T extends { rereads: unknown }>(state: T) {
  const { rereads: _rereads, ...rest } = state;
  return rest;
}

describe("readSupplierPriceList of a reread", () => {
  describe("when the page gives rows", () => {
    it("merges them into the list's rows in the page's order and returns the list to review", async () => {
      const { store, extractor, ports } = setup("READ_FAILED");
      store.seedRow({
        id: "row-kept",
        listId: "list-1",
        position: 0,
        description: "Yerba 1 kg",
        priceCents: 100,
        link: LINK,
        linkedByPerson: true,
        reviewed: true,
      });
      store.seedRow({
        id: "row-repriced",
        listId: "list-1",
        position: 1,
        description: "Azucar 1 kg",
        priceCents: 90,
        link: LINK,
        linkedByPerson: true,
        reviewed: true,
      });
      store.seedRow({ id: "row-dropped", listId: "list-1", position: 2, description: "Fideos" });
      extractor.answer = extracted([
        pageRow("Sal fina", 40),
        pageRow("Azucar 1 kg", 95, { page: 2 }),
        pageRow("YERBA 1 KG", 100, { page: 1, barcode: "779" }),
      ]);

      const outcome = await readSupplierPriceList(ports, input);

      expect(outcome).toEqual({ kind: "extracted", rowCount: 3 });
      const state = store.snapshot();
      expect(state.lists[0]).toMatchObject({
        state: "EXTRACTED",
        readFailure: null,
        listDate: "2026-03-10",
        pricesIncludeVat: true,
        version: 6,
        sentAt: FIRST_SENT_AT,
        sentOn: "2026-03-01",
      });
      expect([...state.rows].sort((a, b) => a.position - b.position)).toEqual([
        expect.objectContaining({
          description: "Sal fina",
          position: 0,
          link: null,
          reviewed: false,
          linkedByPerson: false,
        }),
        expect.objectContaining({
          id: "row-repriced",
          position: 1,
          priceCents: 95,
          page: 2,
          link: LINK,
          linkedByPerson: true,
          reviewed: false,
        }),
        expect.objectContaining({
          id: "row-kept",
          position: 2,
          description: "YERBA 1 KG",
          page: 1,
          barcode: "779",
          priceCents: 100,
          link: LINK,
          linkedByPerson: true,
          reviewed: true,
        }),
      ]);
      expect(state.rereads[0]).toMatchObject({ state: "READ", sentAt: NOW, sentOn: SENT_ON });
    });

    it("gives an added row the link remembered by confirmed lists", async () => {
      const { store, extractor, ports } = setup();
      store.seedSupplierItem({
        description: "Sal fina",
        key: { kind: "description", value: "sal fina" },
        link: OTHER_LINK,
      });
      store.seedSupplierItem({
        supplierId: "supplier-b",
        description: "Fideos",
        key: { kind: "description", value: "fideos" },
        link: LINK,
      });
      extractor.answer = extracted([pageRow("Sal fina", 40), pageRow("Fideos", 50)]);

      await readSupplierPriceList(ports, input);

      expect(store.snapshot().rows.map((row) => row.link)).toEqual([OTHER_LINK, null]);
    });

    it("does not lock the supplier's items", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);

      await readSupplierPriceList(ports, input);

      expect(store.lockCallOrder).toEqual(["lockList", "lockList", "lockList"]);
    });

    it("keeps a typed price, its link and its review mark on a row whose page price did not change", async () => {
      const { store, extractor, ports } = setup();
      store.seedRow({
        id: "row-typed",
        listId: "list-1",
        description: "Yerba 1 kg",
        priceCents: 500,
        pagePriceCents: null,
        link: LINK,
        linkedByPerson: true,
        reviewed: true,
      });
      store.seedRow({
        id: "row-typed-over",
        listId: "list-1",
        description: "Azucar 1 kg",
        priceCents: 300,
        pagePriceCents: 90,
        reviewed: true,
      });
      extractor.answer = extracted([pageRow("Yerba 1 kg", null), pageRow("Azucar 1 kg", 90)]);

      await readSupplierPriceList(ports, input);

      expect(store.snapshot().rows).toEqual([
        expect.objectContaining({
          id: "row-typed",
          priceCents: 500,
          pagePriceCents: null,
          link: LINK,
          linkedByPerson: true,
          reviewed: true,
        }),
        expect.objectContaining({
          id: "row-typed-over",
          priceCents: 300,
          pagePriceCents: 90,
          reviewed: true,
        }),
      ]);
    });

    it("sends a row with a typed price back to review at the page's price when the page price changed", async () => {
      const { store, extractor, ports } = setup();
      store.seedRow({
        id: "row-repriced",
        listId: "list-1",
        description: "Yerba 1 kg",
        priceCents: 500,
        pagePriceCents: null,
        link: LINK,
        reviewed: true,
      });
      store.seedRow({
        id: "row-unpriced",
        listId: "list-1",
        description: "Azucar 1 kg",
        priceCents: 300,
        pagePriceCents: 90,
        reviewed: true,
      });
      extractor.answer = extracted([pageRow("Yerba 1 kg", 120), pageRow("Azucar 1 kg", null)]);

      await readSupplierPriceList(ports, input);

      expect(store.snapshot().rows).toEqual([
        expect.objectContaining({
          id: "row-repriced",
          priceCents: 120,
          pagePriceCents: 120,
          link: LINK,
          reviewed: false,
        }),
        expect.objectContaining({
          id: "row-unpriced",
          priceCents: null,
          pagePriceCents: null,
          reviewed: false,
        }),
      ]);
    });

    it("keeps out an item removed after its price was typed while the page still prints it unchanged", async () => {
      const { store, extractor, ports } = setup();
      store.seedRow({
        id: "row-removed",
        listId: "list-1",
        description: "Yerba 1 kg",
        priceCents: 100,
        pagePriceCents: 100,
      });
      await setSupplierPriceListRowPrice(store, {
        listId: "list-1",
        rowId: "row-removed",
        priceCents: 500,
        version: 5,
        actorId: "person-7",
      });
      await removeSupplierPriceListRow(store, {
        listId: "list-1",
        rowId: "row-removed",
        version: 6,
        actorId: "person-7",
      });
      extractor.answer = extracted([pageRow("Yerba 1 kg", 100)]);

      await readSupplierPriceList(ports, input);

      const state = store.snapshot();
      expect(state.rows).toEqual([]);
      expect(state.removedItems).toEqual([
        expect.objectContaining({ listId: "list-1", priceCents: 100 }),
      ]);
    });

    it("keeps a removed item out while its price is unchanged and brings it back when it changed", async () => {
      const { store, extractor, ports } = setup();
      store.seedRemovedItem({ listId: "list-1", description: "Yerba 1 kg", priceCents: 100 });
      store.seedRemovedItem({ listId: "list-1", description: "Azucar 1 kg", priceCents: 90 });
      store.seedRemovedItem({ listId: "list-1", description: "Fideos", priceCents: 50 });
      store.seedRemovedItem({ listId: "list-2", description: "Yerba 1 kg", priceCents: 100 });
      extractor.answer = extracted([
        pageRow("Yerba 1 kg", 100),
        pageRow("Azucar 1 kg", 95),
        pageRow("Sal fina", 40),
      ]);

      await readSupplierPriceList(ports, input);

      const state = store.snapshot();
      expect(state.rows.map((row) => row.description)).toEqual(["Azucar 1 kg", "Sal fina"]);
      expect(state.removedItems.map((item) => [item.listId, item.key.value])).toEqual([
        ["list-2", "yerba 1 kg"],
        ["list-1", "yerba 1 kg"],
      ]);
    });

    it("sends the extractor the reread's page and nothing else, and leaves the list's file alone", async () => {
      const { files, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);

      await readSupplierPriceList(ports, input);

      expect(extractor.received).toEqual([{ kind: "web_page", html: HTML }]);
      expect(files.reads).toEqual([{ listId: "reread-1", contentKind: "HTML" }]);
    });

    it("records the send, on the Argentina day, on the reread before calling the extractor", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);
      const seen: unknown[] = [];
      extractor.onExtract = async () => {
        const state = store.snapshot();
        seen.push({
          openTransactions: store.openTransactions,
          reread: [state.rereads[0]?.sentAt, state.rereads[0]?.sentOn],
          list: [state.lists[0]?.sentAt, state.lists[0]?.sentOn],
        });
      };

      await readSupplierPriceList(ports, input);

      expect(seen).toEqual([
        {
          openTransactions: 0,
          reread: [NOW, SENT_ON],
          list: [FIRST_SENT_AT, "2026-03-01"],
        },
      ]);
    });

    it("is not sent again once read", async () => {
      const { extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);

      await readSupplierPriceList(ports, input);
      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "already_read" });

      expect(extractor.received).toHaveLength(1);
    });

    it("keeps a date only when it is valid", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)], { listDate: "2026-02-30" });

      await readSupplierPriceList(ports, input);

      expect(store.snapshot().lists[0]?.listDate).toBeNull();
    });

    it("keeps a price only when it is valid", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", -5), pageRow("Fideos", 0)]);

      await readSupplierPriceList(ports, input);

      expect(store.snapshot().rows.map((row) => row.priceCents)).toEqual([null, 0]);
    });
  });

  describe("of a store's catalog", () => {
    it("reads the catalog without the AI service, dated the day it was sent", async () => {
      const { store, files, extractor, storeCatalogs, ports } = setup();
      store.seedReread({ id: "reread-2", listId: "list-2", contentKind: "STORE_CATALOG" });
      store.seedList({ id: "list-2", state: "EXTRACTED", sourceKind: "WEB_PAGE", sourceUrl: "x" });
      const catalog = new Uint8Array([91, 93]);
      files.stored.set("reread-2", catalog);
      files.contentKinds.set("reread-2", "STORE_CATALOG");
      storeCatalogs.answer = { kind: "read", rows: [pageRow("Sal fina", 40)] };

      const outcome = await readSupplierPriceList(ports, { ...input, listId: "list-2" });

      expect(outcome).toEqual({ kind: "extracted", rowCount: 1 });
      expect(storeCatalogs.received).toEqual([catalog]);
      expect(extractor.received).toEqual([]);
      expect(store.snapshot().lists[1]).toMatchObject({
        listDate: SENT_ON,
        pricesIncludeVat: true,
      });
    });
  });

  describe("when the page gives no rows", () => {
    const cases: [PriceListExtraction, SupplierPriceListReadFailure][] = [
      [extracted([]), "no_items_found"],
      [{ kind: "unreadable" }, "unreadable_document"],
      [{ kind: "unavailable" }, "reading_unavailable"],
    ];

    it.each(cases)("fails %j as %s, leaving the list as it was", async (answer, reason) => {
      const { store, extractor, ports } = setup();
      store.seedRow({ id: "row-1", listId: "list-1", link: LINK, reviewed: true });
      store.seedRemovedItem({ listId: "list-1", description: "Fideos", priceCents: 1 });
      extractor.answer = answer;
      const before = store.snapshot();

      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "failed", reason });

      const after = store.snapshot();
      expect(withoutRereads(after)).toEqual(withoutRereads(before));
      expect(after.rereads[0]).toMatchObject({
        state: "READ_FAILED",
        readFailure: reason,
        sentOn: SENT_ON,
      });
    });

    it("treats a thrown error as an unavailable service", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = new Error("timeout");

      expect(await readSupplierPriceList(ports, input)).toEqual({
        kind: "failed",
        reason: "reading_unavailable",
      });
      expect(store.snapshot().rereads[0]).toMatchObject({
        state: "READ_FAILED",
        readFailure: "reading_unavailable",
      });
      expect(store.snapshot().lists[0]).toMatchObject({ state: "EXTRACTED", version: 5 });
    });

    it("fails a reread whose page is missing, without marking it sent", async () => {
      const { store, files, extractor, ports } = setup();
      files.stored.delete("reread-1");
      const before = store.snapshot();

      expect(await readSupplierPriceList(ports, input)).toEqual({
        kind: "failed",
        reason: "reading_unavailable",
      });

      expect(extractor.received).toEqual([]);
      const after = store.snapshot();
      expect(withoutRereads(after)).toEqual(withoutRereads(before));
      expect(after.rereads[0]).toMatchObject({
        state: "READ_FAILED",
        readFailure: "reading_unavailable",
        sentAt: null,
        sentOn: null,
      });
    });
  });

  describe("when the reread is not to be read", () => {
    it("fails a reread already sent without an answer, never sending it again", async () => {
      const { store, extractor, ports } = setup();
      store.seedReread({
        id: "reread-sent",
        listId: "list-2",
        sentAt: FIRST_SENT_AT,
        sentOn: "2026-03-01",
      });
      store.seedList({ id: "list-2", state: "EXTRACTED", sourceKind: "WEB_PAGE", sourceUrl: "x" });

      expect(await readSupplierPriceList(ports, { ...input, listId: "list-2" })).toEqual({
        kind: "interrupted",
      });

      expect(extractor.received).toEqual([]);
      expect(store.snapshot().rereads[1]).toMatchObject({
        state: "READ_FAILED",
        readFailure: "interrupted",
      });
      expect(store.snapshot().lists[1]).toMatchObject({ state: "EXTRACTED", version: 1 });
    });

    it("closes the reread of a discarded list as interrupted, without reading it", async () => {
      const { store, extractor, ports } = setup("DISCARDED");

      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "already_read" });

      expect(extractor.received).toEqual([]);
      expect(store.snapshot().rereads[0]).toMatchObject({
        state: "READ_FAILED",
        readFailure: "interrupted",
      });
    });

    it("does nothing for a list with no reread to read", async () => {
      const { store, extractor, ports } = setup();
      store.seedList({ id: "list-3", state: "EXTRACTED" });
      const before = store.snapshot();

      expect(await readSupplierPriceList(ports, { ...input, listId: "list-3" })).toEqual({
        kind: "already_read",
      });

      expect(store.snapshot()).toEqual(before);
      expect(extractor.received).toEqual([]);
    });

    it("does not send a reread another run marked sent while its page was read", async () => {
      const { store, files, extractor, ports } = setup();
      files.onRead = () => store.transaction((tx) => tx.markRereadSent("reread-1", NOW, SENT_ON));

      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "already_read" });
      expect(extractor.received).toEqual([]);
    });

    it("does not send a reread no longer being read when its page was read", async () => {
      const { store, files, extractor, ports } = setup();
      files.onRead = () =>
        store.transaction((tx) => tx.recordRereadFailure("reread-1", "interrupted"));

      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "already_read" });
      expect(extractor.received).toEqual([]);
    });

    it("keeps a missing page from overwriting a reread closed meanwhile", async () => {
      const { store, files, ports } = setup();
      files.stored.delete("reread-1");
      files.onRead = () =>
        store.transaction((tx) => tx.recordRereadFailure("reread-1", "interrupted"));

      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "already_read" });
      expect(store.snapshot().rereads[0]?.readFailure).toBe("interrupted");
    });

    it("fails the reread as interrupted when the list is discarded while the page is read", async () => {
      const { store, extractor, ports } = setup();
      store.seedRow({ id: "row-1", listId: "list-1", priceCents: 1 });
      extractor.answer = extracted([pageRow("Sal fina", 40)]);
      extractor.reportedCalls = [aUsage()];
      extractor.onExtract = () =>
        store.transaction((tx) => tx.discardList("list-1", NOW, "person-1"));

      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "interrupted" });

      const state = store.snapshot();
      expect(state.rows.map((row) => row.id)).toEqual(["row-1"]);
      expect(state.lists[0]).toMatchObject({ state: "DISCARDED", version: 6 });
      expect(state.rereads[0]).toMatchObject({ state: "READ_FAILED", readFailure: "interrupted" });
      expect(state.aiCalls).toHaveLength(1);
    });

    it("keeps a late answer from overwriting a reread closed while the service was called", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);
      extractor.reportedCalls = [aUsage()];
      extractor.onExtract = () =>
        store.transaction((tx) => tx.recordRereadFailure("reread-1", "interrupted"));

      expect(await readSupplierPriceList(ports, input)).toEqual({ kind: "already_read" });

      const state = store.snapshot();
      expect(state.rows).toEqual([]);
      expect(state.rereads[0]).toMatchObject({ state: "READ_FAILED", readFailure: "interrupted" });
      expect(state.aiCalls).toHaveLength(1);
    });
  });

  describe("recording of the AI calls", () => {
    it("records the reported calls for the list, its reading and the person who uploaded it", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);
      extractor.reportedCalls = [aUsage()];

      await readSupplierPriceList(ports, input);

      expect(store.snapshot().aiCalls).toEqual([
        expect.objectContaining({
          purpose: "READING",
          listId: "list-1",
          rowId: null,
          actorId: "person-7",
          occurredAt: NOW,
          occurredOn: SENT_ON,
        }),
      ]);
    });

    it.each([extracted([]), { kind: "unreadable" as const }])(
      "records the calls when the answer is %j",
      async (answer) => {
        const { store, extractor, ports } = setup();
        extractor.answer = answer;
        extractor.reportedCalls = [aUsage({}, "failed")];

        await readSupplierPriceList(ports, input);

        expect(store.snapshot().aiCalls).toHaveLength(1);
      },
    );

    it("does not merge the answer when its calls cannot be recorded", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);
      extractor.reportedCalls = [aUsage()];
      store.failingWrites.add("recordAiCalls");

      await expect(readSupplierPriceList(ports, input)).rejects.toThrow("recordAiCalls failed");

      expect(store.snapshot().rows).toEqual([]);
      expect(store.snapshot().rereads[0]?.state).toBe("READING");
    });
  });

  describe("a run that throws", () => {
    it("leaves the reread to the next attempt when attempts remain", async () => {
      const { store, files, ports } = setup();
      files.onRead = async () => {
        throw new Error("bucket unavailable");
      };

      await expect(readSupplierPriceList(ports, input)).rejects.toThrow("bucket unavailable");

      expect(store.snapshot().rereads[0]).toMatchObject({ state: "READING", sentAt: null });
    });

    it("fails a reread never sent as unavailable on the final attempt", async () => {
      const { store, files, ports } = setup();
      files.onRead = async () => {
        throw new Error("bucket unavailable");
      };

      await expect(readSupplierPriceList(ports, { ...input, finalAttempt: true })).rejects.toThrow(
        "bucket unavailable",
      );

      expect(store.snapshot().rereads[0]).toMatchObject({
        state: "READ_FAILED",
        readFailure: "reading_unavailable",
      });
      expect(store.snapshot().lists[0]).toMatchObject({ state: "EXTRACTED", version: 5 });
    });

    it("fails a sent reread as interrupted when its answer cannot be recorded on the final attempt", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);
      extractor.reportedCalls = [aUsage()];
      store.failingWrites.add("recordReread");

      await expect(readSupplierPriceList(ports, { ...input, finalAttempt: true })).rejects.toThrow(
        "recordReread failed",
      );

      expect(store.snapshot().rereads[0]).toMatchObject({
        state: "READ_FAILED",
        readFailure: "interrupted",
      });
      expect(store.snapshot().rows).toEqual([]);
      expect(store.snapshot().aiCalls).toHaveLength(1);
    });

    it("records the calls of a failed attempt that will be retried", async () => {
      const { store, extractor, ports } = setup();
      extractor.answer = extracted([pageRow("Sal fina", 40)]);
      extractor.reportedCalls = [aUsage()];
      store.failingWrites.add("recordReread");

      await expect(readSupplierPriceList(ports, input)).rejects.toThrow("recordReread failed");

      expect(store.snapshot().aiCalls).toHaveLength(1);
      expect(store.snapshot().rereads[0]).toMatchObject({ state: "READING" });
    });

    it("leaves a reread another run already closed as it is on the final attempt", async () => {
      const { store, files, ports } = setup();
      files.onRead = async () => {
        await store.transaction((tx) => tx.recordRereadFailure("reread-1", "no_items_found"));
        throw new Error("bucket unavailable");
      };

      await expect(readSupplierPriceList(ports, { ...input, finalAttempt: true })).rejects.toThrow(
        "bucket unavailable",
      );

      expect(store.snapshot().rereads[0]?.readFailure).toBe("no_items_found");
    });
  });
});
