import { describe, expect, it } from "vitest";
import type { BuyerIdentificationThreshold } from "../model/buyer-identification-threshold.js";
import { recordBuyerIdentificationThreshold } from "./record-buyer-identification-threshold.js";
import { FakeBuyerIdentificationThresholdStore } from "./test-support/fake-buyer-identification-threshold-store.js";

const now = new Date("2026-06-10T15:00:00.000Z");
const clock = { now: () => now };

const inEffectToday: BuyerIdentificationThreshold = {
  id: "old-1",
  amount: 2_000_000,
  validFrom: "2026-06-01",
  revision: 0,
};

function record(
  store: FakeBuyerIdentificationThresholdStore,
  validFrom: string,
  options: { amount?: number; confirmedLowerThanInEffect?: boolean } = {},
) {
  return recordBuyerIdentificationThreshold(
    { store, clock },
    {
      amount: options.amount ?? 3_000_000,
      validFrom,
      actorId: "actor-1",
      confirmedLowerThanInEffect: options.confirmedLowerThanInEffect ?? false,
    },
  );
}

describe("recordBuyerIdentificationThreshold", () => {
  it("records the first threshold, as revision 0, for today", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();

    const outcome = await record(store, "2026-06-10");

    const recorded = {
      id: "threshold-1",
      amount: 3_000_000,
      validFrom: "2026-06-10",
      revision: 0,
    };
    expect(outcome).toEqual({ kind: "recorded", threshold: recorded });
    expect(store.snapshot().thresholds).toEqual([recorded]);
  });

  it("records a threshold for a later day as revision 0, keeping the previous ones", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();
    store.seedThreshold(inEffectToday);

    const outcome = await record(store, "2026-07-01");

    const recorded = {
      id: "threshold-1",
      amount: 3_000_000,
      validFrom: "2026-07-01",
      revision: 0,
    };
    expect(outcome).toEqual({ kind: "recorded", threshold: recorded });
    expect(store.snapshot().thresholds).toEqual([inEffectToday, recorded]);
  });

  it("reads the Argentine day, not the UTC one, as today", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();
    const lateAtNightUtc = new Date("2026-06-10T01:00:00.000Z");

    const outcome = await recordBuyerIdentificationThreshold(
      { store, clock: { now: () => lateAtNightUtc } },
      {
        amount: 3_000_000,
        validFrom: "2026-06-09",
        actorId: "actor-1",
        confirmedLowerThanInEffect: false,
      },
    );

    expect(outcome.kind).toBe("recorded");
  });

  it("refuses a day before today, writing nothing and taking no lock", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();
    store.seedThreshold(inEffectToday);
    const before = store.snapshot();

    const outcome = await record(store, "2026-06-09");

    expect(outcome).toEqual({ kind: "before_today", today: "2026-06-10" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("refuses a day before today even when the lower amount was confirmed", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();
    store.seedThreshold(inEffectToday);

    const outcome = await record(store, "2026-06-09", {
      amount: 1,
      confirmedLowerThanInEffect: true,
    });

    expect(outcome.kind).toBe("before_today");
  });

  describe("replacing the threshold of a day", () => {
    const mistaken = { id: "m-1", amount: 10_000, validFrom: "2026-06-10", revision: 0 };

    it("records it as a new row with the next revision, leaving the replaced row untouched", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold(inEffectToday);
      store.seedThreshold(mistaken);

      const outcome = await record(store, "2026-06-10", { amount: 10_000_000 });

      const recorded = {
        id: "threshold-1",
        amount: 10_000_000,
        validFrom: "2026-06-10",
        revision: 1,
      };
      expect(outcome).toEqual({ kind: "recorded", threshold: recorded });
      expect(store.snapshot().thresholds).toEqual([inEffectToday, mistaken, recorded]);
    });

    it("numbers each further replacement after the highest revision of the day", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold({ ...mistaken, revision: 4 });
      store.seedThreshold({ ...mistaken, id: "m-0", revision: 1 });

      const outcome = await record(store, "2026-06-10", { amount: 10_000_000 });

      expect(outcome).toMatchObject({ kind: "recorded", threshold: { revision: 5 } });
    });

    it("replaces a threshold of a future day the same way", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold(inEffectToday);
      store.seedThreshold({ id: "f-1", amount: 5_000_000, validFrom: "2026-07-01", revision: 0 });

      const outcome = await record(store, "2026-07-01", { amount: 6_000_000 });

      expect(outcome).toMatchObject({
        kind: "recorded",
        threshold: { validFrom: "2026-07-01", revision: 1 },
      });
    });
  });

  describe("audit trail", () => {
    it("hands the store who recorded it and no replaced threshold when none was replaced", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();

      await record(store, "2026-06-11");

      expect(store.snapshot().audited).toEqual([
        {
          amount: 3_000_000,
          validFrom: "2026-06-11",
          revision: 0,
          actorId: "actor-1",
          replaced: undefined,
        },
      ]);
    });

    it("hands the store the threshold it replaced", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      const mistaken = { id: "m-1", amount: 10_000, validFrom: "2026-06-10", revision: 2 };
      store.seedThreshold(mistaken);

      await record(store, "2026-06-10", { amount: 10_000_000 });

      expect(store.snapshot().audited).toEqual([
        {
          amount: 10_000_000,
          validFrom: "2026-06-10",
          revision: 3,
          actorId: "actor-1",
          replaced: mistaken,
        },
      ]);
    });
  });

  describe("a lower amount than the one in effect today", () => {
    it("asks for confirmation, writing nothing", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold(inEffectToday);
      const before = store.snapshot();

      const outcome = await record(store, "2026-07-01", { amount: 1_999_999 });

      expect(outcome).toEqual({
        kind: "needs_confirmation",
        inEffectAmount: 2_000_000,
        amount: 1_999_999,
        validFrom: "2026-07-01",
      });
      expect(store.snapshot()).toEqual(before);
    });

    it("compares with the threshold in effect today, not the one it replaces", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold(inEffectToday);
      store.seedThreshold({ id: "f-1", amount: 5_000_000, validFrom: "2026-07-01", revision: 0 });

      const outcome = await record(store, "2026-07-01", { amount: 3_000_000 });

      expect(outcome.kind).toBe("recorded");
    });

    it("asks for confirmation when replacing the threshold in effect today with a lower one", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold({ id: "t-1", amount: 9_000_000, validFrom: "2026-06-10", revision: 0 });

      const outcome = await record(store, "2026-06-10", { amount: 1_000 });

      expect(outcome).toEqual({
        kind: "needs_confirmation",
        inEffectAmount: 9_000_000,
        amount: 1_000,
        validFrom: "2026-06-10",
      });
    });

    it("records it once the request confirms", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold(inEffectToday);

      const outcome = await record(store, "2026-07-01", {
        amount: 1_999_999,
        confirmedLowerThanInEffect: true,
      });

      expect(outcome.kind).toBe("recorded");
    });

    it.each([
      ["equal to", 2_000_000],
      ["above", 2_000_001],
    ])("needs no confirmation for an amount %s the one in effect", async (_case, amount) => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold(inEffectToday);

      const outcome = await record(store, "2026-07-01", { amount });

      expect(outcome.kind).toBe("recorded");
    });

    it("needs no confirmation when no threshold is in effect", async () => {
      const store = new FakeBuyerIdentificationThresholdStore();
      store.seedThreshold({ id: "f-1", amount: 5_000_000, validFrom: "2026-07-01", revision: 0 });

      const outcome = await record(store, "2026-07-01", { amount: 1 });

      expect(outcome.kind).toBe("recorded");
    });
  });

  it("takes the lock, reads what it needs and records, in one transaction", async () => {
    const store = new FakeBuyerIdentificationThresholdStore();

    await record(store, "2026-06-11");

    expect(store.operationOrder).toEqual([
      "lockBuyerIdentificationThresholds",
      "readThresholdStartingOn",
      "readThresholdInEffectOn",
      "recordBuyerIdentificationThreshold",
    ]);
    expect(store.transactionCount).toBe(1);
  });
});
