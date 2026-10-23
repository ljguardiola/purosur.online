import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import type { PendingDeferredSale } from "../model/deferred-sale-record.js";
import { regularizeExpiredDeferredSales } from "./regularize-expired-deferred-sales.js";
import { FakeDeferredSaleExpiryStore } from "./test-support/fake-deferred-sale-expiry.js";
import { FixedClock } from "./test-support/fixed-clock.js";

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time));
}

function pendingSale(id: string, occurredAt: Date): PendingDeferredSale {
  return {
    id,
    saleId: `sale-of-${id}`,
    registerId: "register-1",
    locationId: "branch-1",
    occurredAt,
    total: 250000,
    shortCode: `CODE${id}`.slice(0, 8).padEnd(8, "2"),
  };
}

function regularize(store: FakeDeferredSaleExpiryStore, now: Date) {
  return regularizeExpiredDeferredSales({ store, clock: new FixedClock(now) });
}

describe("regularizeExpiredDeferredSales", () => {
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

  it("never reads a sale of today: the bound is the start of today in Argentina", async () => {
    const store = new FakeDeferredSaleExpiryStore([
      pendingSale("today", at("2026-10-16", "00:30")),
    ]);

    await regularize(store, new Date("2026-10-17T02:00:00Z"));

    expect(store.lockedBounds).toEqual([at("2026-10-16", "00:00")]);
    expect(store.readSaleIds).toEqual([]);
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
