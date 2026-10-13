import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { type SetLotReferenceCostInput, setLotReferenceCost } from "./set-lot-reference-cost.js";
import { type FakeCostLot, FakeLotCostStore } from "./test-support/fake-lot-cost-store.js";

const BRANCH = "branch-1";

function lot(id: string, overrides: Partial<FakeCostLot> = {}): FakeCostLot {
  return {
    id,
    locationId: BRANCH,
    origin: "initial_count",
    withdrawn: false,
    remaining: 1_000,
    cost: null,
    costIncomplete: true,
    ...overrides,
  };
}

function input(overrides: Partial<SetLotReferenceCostInput> = {}): SetLotReferenceCostInput {
  return { locationId: BRANCH, lotId: "lot-1", unitCostCents: 1_234, ...overrides };
}

describe("setLotReferenceCost", () => {
  it("types the cost per sale unit as the exact fraction of one unit and no longer leaves it incomplete", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    const outcome = await setLotReferenceCost({ store }, input());

    expect(outcome).toEqual({ kind: "set" });
    expect(store.lots[0]).toMatchObject({
      cost: { totalCents: 1_234, quantity: 1_000 },
      costIncomplete: false,
    });
  });

  it("lets the cost be typed again later, replacing the earlier one", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);
    await setLotReferenceCost({ store }, input());

    const outcome = await setLotReferenceCost({ store }, input({ unitCostCents: 1_500 }));

    expect(outcome).toEqual({ kind: "set" });
    expect(store.lots[0]).toMatchObject({
      cost: { totalCents: 1_500, quantity: 1_000 },
      costIncomplete: false,
    });
  });

  it("changes only the lot asked for", async () => {
    const store = new FakeLotCostStore([lot("lot-1"), lot("lot-2")]);

    await setLotReferenceCost({ store }, input());

    expect(store.lots[1]).toMatchObject({ cost: null, costIncomplete: true });
  });

  it("says not found for a lot that does not exist", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    expect(await setLotReferenceCost({ store }, input({ lotId: "lot-ghost" }))).toEqual({
      kind: "not_found",
    });
  });

  it("says not found for a lot of another branch", async () => {
    const store = new FakeLotCostStore([lot("lot-1", { locationId: "branch-2" })]);

    expect(await setLotReferenceCost({ store }, input())).toEqual({ kind: "not_found" });
    expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
  });

  it.each(["purchase", "technical"] as const)(
    "refuses a %s lot, whose cost does not come from the initial count",
    async (origin) => {
      const store = new FakeLotCostStore([
        lot("lot-1", { origin, cost: { totalCents: 500, quantity: 1_000 }, costIncomplete: false }),
      ]);

      const outcome = await setLotReferenceCost({ store }, input());

      expect(outcome).toEqual({ kind: "not_an_initial_count_lot" });
      expect(store.lots[0]?.cost).toEqual({ totalCents: 500, quantity: 1_000 });
    },
  );

  it.each([0, -2_000])("refuses the lot of a withdrawn line that holds %s", async (remaining) => {
    const store = new FakeLotCostStore([lot("lot-1", { withdrawn: true, remaining })]);

    const outcome = await setLotReferenceCost({ store }, input());

    expect(outcome).toEqual({ kind: "lot_withdrawn" });
    expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
  });

  it("types the cost of a withdrawn line's lot that still holds stock", async () => {
    const store = new FakeLotCostStore([lot("lot-1", { withdrawn: true, remaining: 1 })]);

    const outcome = await setLotReferenceCost({ store }, input());

    expect(outcome).toEqual({ kind: "set" });
    expect(store.lots[0]).toMatchObject({
      cost: { totalCents: 1_234, quantity: 1_000 },
      costIncomplete: false,
    });
  });

  it.each([0, -2_000])(
    "types the cost of a lot of a line not withdrawn that holds %s",
    async (remaining) => {
      const store = new FakeLotCostStore([lot("lot-1", { remaining })]);

      expect(await setLotReferenceCost({ store }, input())).toEqual({ kind: "set" });
    },
  );

  it.each([0, -1, 10.5, MAX_CASH_AMOUNT_CENTS + 1, Number.NaN])(
    "refuses the cost %s without reading anything",
    async (unitCostCents) => {
      const store = new FakeLotCostStore([lot("lot-1")]);

      const outcome = await setLotReferenceCost({ store }, input({ unitCostCents }));

      expect(outcome).toEqual({ kind: "invalid_cost" });
      expect(store.lockedLots).toEqual([]);
    },
  );

  it("accepts the largest amount", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    const outcome = await setLotReferenceCost(
      { store },
      input({ unitCostCents: MAX_CASH_AMOUNT_CENTS }),
    );

    expect(outcome).toEqual({ kind: "set" });
  });

  it("locks the lot before changing it", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    await setLotReferenceCost({ store }, input());

    expect(store.lockedLots).toEqual(["lot-1"]);
  });

  it("leaves the lot as it was when the write fails", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);
    store.failingWrite = true;

    await expect(setLotReferenceCost({ store }, input())).rejects.toThrow(
      "setReferenceCost failed",
    );

    expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
  });
});
