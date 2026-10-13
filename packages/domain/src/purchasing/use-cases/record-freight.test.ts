import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { PURCHASE_NOTE_MAX_LENGTH } from "../model/purchase.js";
import { type RecordFreightInput, recordFreight } from "./record-freight.js";
import { FakeFreightStore } from "./test-support/fake-freight-store.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const CLOCK = { now: () => NOW };
const BRANCH = "branch-1";
const ACTOR = "person-1";

function lines(...costs: number[]) {
  return costs.map((costPaidCents, index) => ({
    id: `line-${costPaidCents}-${index}`,
    costPaidCents,
    quantity: 1000,
    quantityPerPackage: 1000,
  }));
}

function storeWithPurchases(): FakeFreightStore {
  const store = new FakeFreightStore();
  store.purchases = [
    { id: "purchase-1", locationId: BRANCH, lines: lines(100, 300) },
    { id: "purchase-2", locationId: BRANCH, lines: lines(200) },
    { id: "purchase-free", locationId: BRANCH, lines: lines(0, 0) },
    { id: "purchase-elsewhere", locationId: "branch-2", lines: lines(500) },
  ];
  return store;
}

function input(overrides: Partial<RecordFreightInput> = {}): RecordFreightInput {
  return {
    locationId: BRANCH,
    actorId: ACTOR,
    date: "2026-03-09",
    amountCents: 150_000,
    description: "Flete de la entrega de marzo",
    means: { kind: "carrier", name: "Transportes del Sur" },
    purchaseIds: ["purchase-1"],
    ...overrides,
  };
}

describe("recordFreight", () => {
  it("records the freight against the branch, with who recorded it and when", async () => {
    const store = storeWithPurchases();

    const outcome = await recordFreight({ store, clock: CLOCK }, input());

    expect(outcome).toEqual({
      kind: "recorded",
      freight: {
        id: "freight-1",
        locationId: BRANCH,
        actorId: ACTOR,
        recordedAt: NOW,
        date: "2026-03-09",
        amountCents: 150_000,
        description: "Flete de la entrega de marzo",
        means: { kind: "carrier", name: "Transportes del Sur" },
        purchaseIds: ["purchase-1"],
      },
    });
    expect(store.snapshot().freights).toEqual([
      expect.objectContaining({ id: "freight-1", actorId: ACTOR }),
    ]);
  });

  it("records the store's own trip as a means without a name", async () => {
    const outcome = await recordFreight(
      { store: storeWithPurchases(), clock: CLOCK },
      input({ means: { kind: "own_trip" } }),
    );

    expect(outcome).toMatchObject({ kind: "recorded", freight: { means: { kind: "own_trip" } } });
  });

  it("links the purchases once each, in id order", async () => {
    const store = storeWithPurchases();

    const outcome = await recordFreight(
      { store, clock: CLOCK },
      input({ purchaseIds: ["purchase-2", "purchase-1", "purchase-2"] }),
    );

    expect(outcome).toMatchObject({
      kind: "recorded",
      freight: { purchaseIds: ["purchase-1", "purchase-2"] },
    });
  });

  it("accepts a freight dated today and one of the largest cash amount", async () => {
    const outcome = await recordFreight(
      { store: storeWithPurchases(), clock: CLOCK },
      input({ date: "2026-03-10", amountCents: MAX_CASH_AMOUNT_CENTS }),
    );

    expect(outcome.kind).toBe("recorded");
  });

  it("accepts a freight spread over purchases when only some of their lines are worth something", async () => {
    const outcome = await recordFreight(
      { store: storeWithPurchases(), clock: CLOCK },
      input({ purchaseIds: ["purchase-free", "purchase-2"] }),
    );

    expect(outcome.kind).toBe("recorded");
  });

  it("works in one transaction that takes the purchases' locks in id order", async () => {
    const store = storeWithPurchases();

    await recordFreight(
      { store, clock: CLOCK },
      input({ purchaseIds: ["purchase-2", "purchase-1"] }),
    );

    expect(store.transactionCount).toBe(1);
    expect(store.lockLog).toEqual(["purchases:purchase-1,purchase-2"]);
  });

  it("leaves the purchases it covers and the edit trail as they were", async () => {
    const store = storeWithPurchases();
    const purchasesBefore = structuredClone(store.purchases);

    await recordFreight({ store, clock: CLOCK }, input());

    expect(store.purchases).toEqual(purchasesBefore);
    expect(store.snapshot().edits).toEqual([]);
  });

  it("stores nothing when the write fails", async () => {
    const store = storeWithPurchases();
    store.failWrite("insertFreight");

    await expect(recordFreight({ store, clock: CLOCK }, input())).rejects.toThrow();

    expect(store.snapshot().freights).toEqual([]);
  });

  describe.each([
    ["no_purchases", { purchaseIds: [] }],
    ["invalid_amount", { amountCents: 0 }],
    ["invalid_amount", { amountCents: 10.5 }],
    ["invalid_amount", { amountCents: MAX_CASH_AMOUNT_CENTS + 1 }],
    ["date_in_future", { date: "2026-03-11" }],
    ["invalid_description", { description: "   " }],
    ["invalid_description", { description: "a".repeat(PURCHASE_NOTE_MAX_LENGTH + 1) }],
    ["invalid_means", { means: { kind: "carrier", name: " " } }],
  ] satisfies [string, Partial<RecordFreightInput>][])("when it is %s", (kind, overrides) => {
    it("refuses without opening a transaction", async () => {
      const store = storeWithPurchases();

      const outcome = await recordFreight({ store, clock: CLOCK }, input(overrides));

      expect(outcome).toEqual({ kind });
      expect(store.transactionCount).toBe(0);
      expect(store.snapshot().freights).toEqual([]);
    });
  });

  it("checks the purchases, the amount, the date, the description and the means in that order", async () => {
    const store = storeWithPurchases();
    const everythingWrong = input({
      purchaseIds: [],
      amountCents: 0,
      date: "2026-03-11",
      description: "",
      means: { kind: "carrier", name: "" },
    });

    const refusals = [];
    for (const overrides of [
      {},
      { purchaseIds: ["purchase-1"] },
      { purchaseIds: ["purchase-1"], amountCents: 100 },
      { purchaseIds: ["purchase-1"], amountCents: 100, date: "2026-03-10" },
      { purchaseIds: ["purchase-1"], amountCents: 100, date: "2026-03-10", description: "x" },
    ]) {
      refusals.push(
        await recordFreight({ store, clock: CLOCK }, { ...everythingWrong, ...overrides }),
      );
    }

    expect(refusals.map(({ kind }) => kind)).toEqual([
      "no_purchases",
      "invalid_amount",
      "date_in_future",
      "invalid_description",
      "invalid_means",
    ]);
  });

  it("refuses a purchase that does not exist or belongs to another branch", async () => {
    const store = storeWithPurchases();

    for (const purchaseIds of [["purchase-1", "missing"], ["purchase-elsewhere"]]) {
      const outcome = await recordFreight({ store, clock: CLOCK }, input({ purchaseIds }));
      expect(outcome).toEqual({ kind: "purchase_not_found" });
    }
    expect(store.snapshot().freights).toEqual([]);
  });

  it("refuses to spread a freight over purchases with nothing to proportion it to", async () => {
    const store = storeWithPurchases();

    const outcome = await recordFreight(
      { store, clock: CLOCK },
      input({ purchaseIds: ["purchase-free"] }),
    );

    expect(outcome).toEqual({ kind: "purchases_without_value" });
    expect(store.snapshot().freights).toEqual([]);
  });

  it("reports a missing purchase before purchases without value", async () => {
    const outcome = await recordFreight(
      { store: storeWithPurchases(), clock: CLOCK },
      input({ purchaseIds: ["purchase-free", "missing"] }),
    );

    expect(outcome).toEqual({ kind: "purchase_not_found" });
  });
});
