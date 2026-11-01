import { describe, expect, it } from "vitest";
import { argentinaInstant, FIXED_ARGENTINA_ZONE_RULES } from "../../shared/index.js";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { recordExceptionShareBreaches } from "./record-exception-share-breaches.js";
import type { ExceptionShareMonth } from "./record-exception-share-breaches-ports.js";
import { FakeExceptionShareBreachStore } from "./test-support/fake-exception-share-breaches.js";
import { FixedClock } from "./test-support/fixed-clock.js";

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time, FIXED_ARGENTINA_ZONE_RULES));
}

function month(
  fiscalAddressId: string,
  monthKey: string,
  exceptionCount: number,
  totalCount: number,
): ExceptionShareMonth {
  return { fiscalAddressId, month: monthKey, exceptionCount, totalCount };
}

function record(store: FakeExceptionShareBreachStore, now: Date) {
  return recordExceptionShareBreaches({
    store,
    clock: new FixedClock(now),
    zoneRules: new FakeZoneRulesSource(),
  });
}

describe("recordExceptionShareBreaches", () => {
  it("asks for the closed months of the previous and the current year by Argentina's calendar", async () => {
    const store = new FakeExceptionShareBreachStore([]);

    await record(store, new Date("2026-11-01T02:30:00.000Z"));

    expect(store.windows).toEqual([{ from: "2025-01", through: "2026-09" }]);
  });

  it("records a closed month whose exceptions reach 5% of its vouchers", async () => {
    const store = new FakeExceptionShareBreachStore([month("fa-1", "2026-09", 5, 100)]);

    const outcome = await record(store, at("2026-10-02"));

    expect(outcome).toEqual({ kind: "recorded", recorded: 1, updated: 0 });
    expect(store.recorded).toEqual([month("fa-1", "2026-09", 5, 100)]);
  });

  it("records nothing for a closed month under the threshold", async () => {
    const store = new FakeExceptionShareBreachStore([month("fa-1", "2026-09", 4, 100)]);

    const outcome = await record(store, at("2026-10-02"));

    expect(outcome).toEqual({ kind: "recorded", recorded: 0, updated: 0 });
    expect(store.recorded).toEqual([]);
  });

  it("records nothing while the month is open, however high its running figure", async () => {
    const store = new FakeExceptionShareBreachStore([month("fa-1", "2026-10", 9, 10)]);

    const outcome = await record(store, at("2026-10-31", "23:30"));

    expect(outcome).toEqual({ kind: "recorded", recorded: 0, updated: 0 });
    expect(store.recorded).toEqual([]);
  });

  it("records the month on the first day after it closes", async () => {
    const store = new FakeExceptionShareBreachStore([month("fa-1", "2026-10", 9, 10)]);

    await record(store, at("2026-11-01", "00:30"));

    expect(store.recorded).toEqual([month("fa-1", "2026-10", 9, 10)]);
  });

  it("keeps each fiscal address and each month apart", async () => {
    const store = new FakeExceptionShareBreachStore([
      month("fa-1", "2026-08", 1, 100),
      month("fa-1", "2026-09", 6, 100),
      month("fa-2", "2026-08", 3, 40),
      month("fa-2", "2026-09", 1, 100),
    ]);

    const outcome = await record(store, at("2026-10-02"));

    expect(outcome).toEqual({ kind: "recorded", recorded: 2, updated: 0 });
    expect(store.recorded).toEqual([
      month("fa-1", "2026-09", 6, 100),
      month("fa-2", "2026-08", 3, 40),
    ]);
  });

  it("leaves a recorded month alone when its figures did not change", async () => {
    const recorded = month("fa-1", "2026-09", 5, 100);
    const store = new FakeExceptionShareBreachStore([recorded], [recorded]);

    const outcome = await record(store, at("2026-10-02"));

    expect(outcome).toEqual({ kind: "recorded", recorded: 0, updated: 0 });
    expect(store.recorded).toEqual([recorded]);
  });

  it("updates the figures of a recorded month when more vouchers reached the cloud", async () => {
    const store = new FakeExceptionShareBreachStore(
      [month("fa-1", "2026-09", 7, 120)],
      [month("fa-1", "2026-09", 5, 100)],
    );

    const outcome = await record(store, at("2026-10-02"));

    expect(outcome).toEqual({ kind: "recorded", recorded: 0, updated: 1 });
    expect(store.recorded).toEqual([month("fa-1", "2026-09", 7, 120)]);
  });

  it("keeps a recorded month on record when later vouchers lower its share under the threshold", async () => {
    const store = new FakeExceptionShareBreachStore(
      [month("fa-1", "2026-09", 5, 200)],
      [month("fa-1", "2026-09", 5, 100)],
    );

    const outcome = await record(store, at("2026-10-02"));

    expect(outcome).toEqual({ kind: "recorded", recorded: 0, updated: 1 });
    expect(store.recorded).toEqual([month("fa-1", "2026-09", 5, 200)]);
  });

  it("updates only the recorded month whose figures changed", async () => {
    const store = new FakeExceptionShareBreachStore(
      [month("fa-1", "2026-08", 5, 100), month("fa-2", "2026-08", 6, 100)],
      [month("fa-1", "2026-08", 5, 100), month("fa-2", "2026-08", 5, 100)],
    );

    await record(store, at("2026-10-02"));

    expect(store.recorded).toEqual([
      month("fa-1", "2026-08", 5, 100),
      month("fa-2", "2026-08", 6, 100),
    ]);
  });

  it("does the whole run in one transaction that leaves nothing behind when it fails", async () => {
    const store = new FakeExceptionShareBreachStore(
      [month("fa-1", "2026-08", 9, 100), month("fa-1", "2026-09", 7, 120)],
      [month("fa-1", "2026-09", 5, 100)],
    );
    store.failOnUpdating = true;

    await expect(record(store, at("2026-10-02"))).rejects.toThrow("storage failure");

    expect(store.transactions).toBe(1);
    expect(store.recorded).toEqual([month("fa-1", "2026-09", 5, 100)]);
  });
});
