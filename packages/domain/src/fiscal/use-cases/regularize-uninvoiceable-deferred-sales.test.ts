import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { regularizeUninvoiceableDeferredSales } from "./regularize-uninvoiceable-deferred-sales.js";
import type { DeferredSaleCandidate } from "./regularize-uninvoiceable-deferred-sales-ports.js";
import { FakeDeferredSaleExpiryStore } from "./test-support/fake-deferred-sale-expiry.js";
import { FixedClock } from "./test-support/fixed-clock.js";

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time));
}

function pendingSale(
  id: string,
  occurredAt: Date,
  lastAuthorizedIssuedOn: string | null = null,
  saleMayBeInvoiced = false,
): DeferredSaleCandidate {
  return {
    id,
    saleId: `sale-of-${id}`,
    registerId: "register-1",
    locationId: "branch-1",
    occurredAt,
    total: 250000,
    shortCode: `CODE${id}`.slice(0, 8).padEnd(8, "2"),
    lastAuthorizedIssuedOn,
    saleMayBeInvoiced,
  };
}

function regularize(store: FakeDeferredSaleExpiryStore, now: Date) {
  return regularizeUninvoiceableDeferredSales({ store, clock: new FixedClock(now) });
}

describe("regularizeUninvoiceableDeferredSales", () => {
  it("turns a sale past its expiry into an open regularization task named for the sale", async () => {
    const sale = pendingSale("sale-1", at("2026-10-10"));
    const store = new FakeDeferredSaleExpiryStore([sale]);
    const now = at("2026-10-16", "09:00");

    const outcome = await regularize(store, now);

    expect(outcome).toEqual({ kind: "regularized", count: 1 });
    expect(store.pendingIds).toEqual([]);
    expect(store.tasks).toEqual([
      {
        kind: "deferred_sale_expired",
        state: "open",
        deferredSaleId: "sale-1",
        registerId: "register-1",
        saleOccurredAt: sale.occurredAt,
        total: 250000,
        shortCode: sale.shortCode,
        createdAt: now,
      },
    ]);
  });

  it("leaves a sale alone through the last instant of its expiry day", async () => {
    const store = new FakeDeferredSaleExpiryStore([pendingSale("sale-1", at("2026-10-10"))]);

    const outcome = await regularize(store, new Date("2026-10-15T23:59:59.999-03:00"));

    expect(outcome).toEqual({ kind: "regularized", count: 0 });
    expect(store.pendingIds).toEqual(["sale-1"]);
    expect(store.tasks).toEqual([]);
  });

  it("expires a sale of a month's last days at the month's end", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("sale-1", at("2026-09-27")),
      pendingSale("sale-2", at("2026-09-30", "20:00")),
    ]);

    expect(await regularize(store, new Date("2026-09-30T23:59:59.999-03:00"))).toEqual({
      kind: "regularized",
      count: 0,
    });
    expect(await regularize(store, new Date("2026-10-01T00:00:00-03:00"))).toEqual({
      kind: "regularized",
      count: 2,
    });
    expect(store.tasks.map((task) => task.deferredSaleId)).toEqual(["sale-1", "sale-2"]);
  });

  it("regularizes only the expired sales when pending ones of several ages are mixed", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("old", at("2026-10-01")),
      pendingSale("recent", at("2026-10-14")),
      pendingSale("today", at("2026-10-16", "08:00")),
    ]);

    const outcome = await regularize(store, at("2026-10-16", "09:00"));

    expect(outcome).toEqual({ kind: "regularized", count: 1 });
    expect(store.pendingIds).toEqual(["recent", "today"]);
    expect(store.tasks.map((task) => task.deferredSaleId)).toEqual(["old"]);
  });

  it("answers zero when nothing is pending", async () => {
    const store = new FakeDeferredSaleExpiryStore([]);

    expect(await regularize(store, at("2026-10-16"))).toEqual({ kind: "regularized", count: 0 });
    expect(store.tasks).toEqual([]);
  });

  it("regularizes a sale not yet expired whose day is before its point of sale's last authorized day", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("behind", at("2026-10-14"), "2026-10-15"),
    ]);
    const now = at("2026-10-16", "09:00");

    const outcome = await regularize(store, now);

    expect(outcome).toEqual({ kind: "regularized", count: 1 });
    expect(store.pendingIds).toEqual([]);
    expect(store.tasks).toEqual([
      {
        kind: "deferred_sale_expired",
        state: "open",
        deferredSaleId: "behind",
        registerId: "register-1",
        saleOccurredAt: at("2026-10-14"),
        total: 250000,
        shortCode: "CODEbehi",
        createdAt: now,
      },
    ]);
  });

  it("regularizes a sale of today when a document dated after it was authorized", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("today", at("2026-10-16", "00:30"), "2026-10-17"),
    ]);

    const outcome = await regularize(store, new Date("2026-10-17T02:00:00Z"));

    expect(outcome).toEqual({ kind: "regularized", count: 1 });
  });

  it("leaves a sale pending when its day is the last authorized day or after it", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("same-day", at("2026-10-14"), "2026-10-14"),
      pendingSale("after", at("2026-10-14"), "2026-10-13"),
    ]);

    const outcome = await regularize(store, at("2026-10-16", "09:00"));

    expect(outcome).toEqual({ kind: "regularized", count: 0 });
    expect(store.pendingIds).toEqual(["same-day", "after"]);
    expect(store.tasks).toEqual([]);
  });

  it("applies only the expiry to a sale whose point of sale has no authorized day", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("expired", at("2026-10-01"), null),
      pendingSale("recent", at("2026-10-14"), null),
    ]);

    const outcome = await regularize(store, at("2026-10-16", "09:00"));

    expect(outcome).toEqual({ kind: "regularized", count: 1 });
    expect(store.pendingIds).toEqual(["recent"]);
  });

  it("regularizes an expired sale even when its day is after the last authorized day", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("expired", at("2026-10-01"), "2026-09-01"),
    ]);

    const outcome = await regularize(store, at("2026-10-16", "09:00"));

    expect(outcome).toEqual({ kind: "regularized", count: 1 });
  });

  it("leaves pending a sale that may already be invoiced, whether past its expiry or behind the last authorized day", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("expired", at("2026-10-01"), null, true),
      pendingSale("behind", at("2026-10-14"), "2026-10-15", true),
    ]);

    const outcome = await regularize(store, at("2026-10-16", "09:00"));

    expect(outcome).toEqual({ kind: "regularized", count: 0 });
    expect(store.pendingIds).toEqual(["expired", "behind"]);
    expect(store.tasks).toEqual([]);
  });

  it("reads and records within one transaction", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("sale-1", at("2026-10-01")),
      pendingSale("sale-2", at("2026-10-02")),
    ]);

    await regularize(store, at("2026-10-16"));

    expect(store.transactions).toBe(1);
  });

  it("leaves every sale pending when recording one of them fails", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("sale-1", at("2026-10-01")),
      pendingSale("sale-2", at("2026-10-02")),
    ]);
    store.failOnRecordingFor = "sale-2";

    await expect(regularize(store, at("2026-10-16"))).rejects.toThrow("storage failure");

    expect(store.pendingIds).toEqual(["sale-1", "sale-2"]);
    expect(store.tasks).toEqual([]);
  });
});
