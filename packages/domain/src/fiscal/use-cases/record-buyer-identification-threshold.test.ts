import { describe, expect, it } from "vitest";
import { recordBuyerIdentificationThreshold } from "./record-buyer-identification-threshold.js";
import { FakeBuyerIdentificationThresholdStore } from "./test-support/fake-buyer-identification-threshold-store.js";

const earlier = { id: "old-1", amount: 1_000_000, validFrom: "2026-01-01" };
const latest = { id: "old-2", amount: 2_000_000, validFrom: "2026-06-01" };

function record(
  store: FakeBuyerIdentificationThresholdStore,
  validFrom: string,
  amount = 3_000_000,
) {
  return recordBuyerIdentificationThreshold({ store }, { amount, validFrom, actorId: "actor-1" });
}

describe("recordBuyerIdentificationThreshold", () => {
  it("records the first threshold on any day", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();

    const outcome = await record(store, "2020-03-04");

    expect(outcome).toEqual({
      kind: "recorded",
      threshold: { id: "threshold-1", amount: 3_000_000, validFrom: "2020-03-04" },
    });
    expect(store.snapshot().thresholds).toEqual([
      { id: "threshold-1", amount: 3_000_000, validFrom: "2020-03-04" },
    ]);
  });

  it("records a threshold that starts after the latest one, keeping the previous ones", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();
    store.seedThreshold(latest);
    store.seedThreshold(earlier);

    const outcome = await record(store, "2026-06-02");

    expect(outcome).toEqual({
      kind: "recorded",
      threshold: { id: "threshold-1", amount: 3_000_000, validFrom: "2026-06-02" },
    });
    expect(store.snapshot().thresholds).toEqual([
      latest,
      earlier,
      { id: "threshold-1", amount: 3_000_000, validFrom: "2026-06-02" },
    ]);
  });

  it("hands the store who recorded it, for the audit trail", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();

    await record(store, "2026-06-02");

    expect(store.snapshot().audited).toEqual([
      { amount: 3_000_000, validFrom: "2026-06-02", actorId: "actor-1" },
    ]);
  });

  it.each([
    ["the same day as", "2026-06-01"],
    ["a day before", "2026-05-31"],
  ])("refuses a threshold that starts %s the latest one, writing nothing", async (_case, day) => {
    const store = new FakeBuyerIdentificationThresholdStore();
    store.seedThreshold(earlier);
    store.seedThreshold(latest);
    const before = store.snapshot();

    const outcome = await record(store, day);

    expect(outcome).toEqual({ kind: "not_after_latest", latestValidFrom: "2026-06-01" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockLatestBuyerIdentificationThreshold"]);
  });

  it("reads the latest threshold before it records, in one transaction", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();

    await record(store, "2026-06-02");

    expect(store.operationOrder).toEqual([
      "lockLatestBuyerIdentificationThreshold",
      "recordBuyerIdentificationThreshold",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
