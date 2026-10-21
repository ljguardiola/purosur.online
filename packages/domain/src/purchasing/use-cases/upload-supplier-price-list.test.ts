import { describe, expect, it } from "vitest";
import { SUPPLIER_PRICE_LIST_PDF_MAX_BYTES } from "../model/supplier-price-list.js";
import { FakeSupplierPriceListFiles } from "./test-support/fake-supplier-price-list-files.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";
import {
  type UploadSupplierPriceListInput,
  uploadSupplierPriceList,
} from "./upload-supplier-price-list.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const BRANCH = "branch-1";
const PDF = new Uint8Array([37, 80, 68, 70]);

function setup() {
  const store = new FakeSupplierPriceListStore();
  store.seedSupplier({ id: "supplier-a", name: "Distribuidora Sur", active: true });
  const files = new FakeSupplierPriceListFiles();
  return { store, files, ports: { store, files } };
}

function input(
  overrides: Partial<UploadSupplierPriceListInput> = {},
): UploadSupplierPriceListInput {
  return {
    supplierId: "supplier-a",
    locationId: BRANCH,
    fileName: "lista-marzo.pdf",
    pdf: PDF,
    actorId: "person-1",
    now: NOW,
    ...overrides,
  };
}

describe("uploadSupplierPriceList", () => {
  it("records a reading list, keeps its file and queues its reading", async () => {
    const { store, files, ports } = setup();

    const outcome = await uploadSupplierPriceList(ports, input());

    expect(outcome).toEqual({ kind: "uploaded", listId: "list-1" });
    expect(store.snapshot().lists).toEqual([
      {
        id: "list-1",
        locationId: BRANCH,
        supplierId: "supplier-a",
        sourceKind: "PDF",
        fileName: "lista-marzo.pdf",
        byteSize: PDF.byteLength,
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
    expect(files.stored.get("list-1")).toBe(PDF);
    expect(store.snapshot().readingQueue).toEqual(["list-1"]);
  });

  it("takes the branch quota lock before anything else", async () => {
    const { store, ports } = setup();

    await uploadSupplierPriceList(ports, input());

    expect(store.lockCallOrder).toEqual(["lockBranchExtractionQuota"]);
    expect(store.transactionCount).toBe(1);
  });

  it("accepts a PDF of exactly the size cap", async () => {
    const { ports } = setup();

    const outcome = await uploadSupplierPriceList(
      ports,
      input({ pdf: new Uint8Array(SUPPLIER_PRICE_LIST_PDF_MAX_BYTES) }),
    );

    expect(outcome.kind).toBe("uploaded");
  });

  it("refuses a PDF over the size cap before reading any data", async () => {
    const { store, files, ports } = setup();

    const outcome = await uploadSupplierPriceList(
      ports,
      input({ pdf: new Uint8Array(SUPPLIER_PRICE_LIST_PDF_MAX_BYTES + 1) }),
    );

    expect(outcome).toEqual({ kind: "file_too_large" });
    expect(store.transactionCount).toBe(0);
    expect(files.stored.size).toBe(0);
  });

  it("refuses an unknown supplier, storing nothing", async () => {
    const { store, files, ports } = setup();

    const outcome = await uploadSupplierPriceList(ports, input({ supplierId: "missing" }));

    expect(outcome).toEqual({ kind: "supplier_not_found" });
    expect(store.snapshot().lists).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  it("refuses a deactivated supplier, storing nothing", async () => {
    const { store, files, ports } = setup();
    store.seedSupplier({ id: "supplier-b", name: "Cerrada", active: false });

    const outcome = await uploadSupplierPriceList(ports, input({ supplierId: "supplier-b" }));

    expect(outcome).toEqual({ kind: "supplier_inactive" });
    expect(store.snapshot().lists).toEqual([]);
    expect(store.snapshot().readingQueue).toEqual([]);
    expect(files.stored.size).toBe(0);
  });

  describe("daily cap", () => {
    it("refuses once the extractions counted today reach the cap, naming it", async () => {
      const { store, files, ports } = setup();
      for (let index = 0; index < 10; index += 1) {
        store.seedList({ id: `sent-${index}`, state: "EXTRACTED", sentOn: "2026-03-10" });
      }

      const outcome = await uploadSupplierPriceList(ports, input());

      expect(outcome).toEqual({ kind: "daily_cap_reached", cap: 10 });
      expect(store.snapshot().lists).toHaveLength(10);
      expect(store.snapshot().readingQueue).toEqual([]);
      expect(files.stored.size).toBe(0);
    });

    it("counts a list still waiting to be read, because it will be sent", async () => {
      const { store, ports } = setup();
      store.branchCaps.set(BRANCH, 2);
      store.seedList({ id: "sent", state: "READ_FAILED", sentOn: "2026-03-10" });
      store.seedList({ id: "waiting", state: "READING", sentOn: null });

      expect(await uploadSupplierPriceList(ports, input())).toEqual({
        kind: "daily_cap_reached",
        cap: 2,
      });
    });

    it("lets the upload through below the cap", async () => {
      const { store, ports } = setup();
      store.branchCaps.set(BRANCH, 2);
      store.seedList({ id: "sent", state: "EXTRACTED", sentOn: "2026-03-10" });

      expect((await uploadSupplierPriceList(ports, input())).kind).toBe("uploaded");
    });

    it("does not count other branches, other days or lists that were never sent", async () => {
      const { store, ports } = setup();
      store.branchCaps.set(BRANCH, 1);
      store.seedList({ id: "other-branch", locationId: "branch-2", sentOn: "2026-03-10" });
      store.seedList({ id: "yesterday", state: "EXTRACTED", sentOn: "2026-03-09" });
      store.seedList({ id: "never-sent", state: "READ_FAILED", sentOn: null });

      expect((await uploadSupplierPriceList(ports, input())).kind).toBe("uploaded");
    });

    it("counts the day in Argentina, not in UTC", async () => {
      const { store, ports } = setup();
      store.branchCaps.set(BRANCH, 1);
      store.seedList({ id: "evening", state: "EXTRACTED", sentOn: "2026-03-10" });

      const lateEvening = new Date("2026-03-11T01:00:00Z");
      expect(await uploadSupplierPriceList(ports, input({ now: lateEvening }))).toEqual({
        kind: "daily_cap_reached",
        cap: 1,
      });
      const nextMorning = new Date("2026-03-11T04:00:00Z");
      expect((await uploadSupplierPriceList(ports, input({ now: nextMorning }))).kind).toBe(
        "uploaded",
      );
    });
  });

  describe("when the operation fails midway", () => {
    it("leaves no list and no queued reading when its file cannot be kept", async () => {
      const { store, files, ports } = setup();
      files.storeFails = true;

      await expect(uploadSupplierPriceList(ports, input())).rejects.toThrow("store failed");

      expect(store.snapshot().lists).toEqual([]);
      expect(store.snapshot().readingQueue).toEqual([]);
    });

    it("leaves no list when queuing its reading fails", async () => {
      const { store, ports } = setup();
      store.failingWrites.add("enqueueReading");

      await expect(uploadSupplierPriceList(ports, input())).rejects.toThrow(
        "enqueueReading failed",
      );

      expect(store.snapshot().lists).toEqual([]);
    });
  });
});
