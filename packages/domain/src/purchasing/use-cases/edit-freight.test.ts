import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import { PURCHASE_NOTE_MAX_LENGTH } from "../model/purchase.js";
import { type EditFreightInput, editFreight } from "./edit-freight.js";
import type { Freight } from "./freight-store.js";
import { FakeFreightStore } from "./test-support/fake-freight-store.js";

const RECORDED_AT = new Date("2026-03-09T12:00:00Z");
const NOW = new Date("2026-03-10T15:00:00Z");
const CLOCK = { now: () => NOW };
const BRANCH = "branch-1";
const RECORDER = "person-1";
const EDITOR = "person-2";

const RECORDED: Freight = {
  id: "freight-a",
  locationId: BRANCH,
  actorId: RECORDER,
  recordedAt: RECORDED_AT,
  date: "2026-03-08",
  amountCents: 150_000,
  description: "Flete de la entrega de marzo",
  means: { kind: "carrier", name: "Transportes del Sur" },
  purchaseIds: ["purchase-1"],
};

function lines(...costs: number[]) {
  return costs.map((costPaidCents, index) => ({
    id: `line-${costPaidCents}-${index}`,
    costPaidCents,
    quantity: 1000,
    quantityPerPackage: 1000,
  }));
}

function storeWithFreight(): FakeFreightStore {
  const store = new FakeFreightStore();
  store.seedFreight(RECORDED);
  store.purchases = [
    { id: "purchase-1", locationId: BRANCH, lines: lines(100, 300) },
    { id: "purchase-2", locationId: BRANCH, lines: lines(200) },
    { id: "purchase-free", locationId: BRANCH, lines: lines(0) },
    { id: "purchase-elsewhere", locationId: "branch-2", lines: lines(500) },
  ];
  return store;
}

function input(overrides: Partial<EditFreightInput> = {}): EditFreightInput {
  return {
    locationId: BRANCH,
    actorId: EDITOR,
    freightId: "freight-a",
    date: "2026-03-09",
    amountCents: 90_000,
    description: "Flete corregido",
    means: { kind: "own_trip" },
    purchaseIds: ["purchase-2", "purchase-1"],
    ...overrides,
  };
}

describe("editFreight", () => {
  it("replaces the date, amount, description, means and linked purchases", async () => {
    const store = storeWithFreight();

    const outcome = await editFreight({ store, clock: CLOCK }, input());

    expect(outcome).toEqual({
      kind: "edited",
      freight: {
        ...RECORDED,
        date: "2026-03-09",
        amountCents: 90_000,
        description: "Flete corregido",
        means: { kind: "own_trip" },
        purchaseIds: ["purchase-1", "purchase-2"],
      },
    });
    expect(store.snapshot().freights).toEqual([(outcome as { freight: Freight }).freight]);
  });

  it("keeps who recorded the freight and when, whoever edits it", async () => {
    const store = storeWithFreight();

    await editFreight({ store, clock: CLOCK }, input());

    expect(store.snapshot().freights[0]).toMatchObject({
      actorId: RECORDER,
      recordedAt: RECORDED_AT,
    });
  });

  it("keeps an audit record of the edit with the editor, the instant and the values before and after", async () => {
    const store = storeWithFreight();

    await editFreight({ store, clock: CLOCK }, input());

    expect(store.snapshot().edits).toEqual([
      {
        freightId: "freight-a",
        actorId: EDITOR,
        editedAt: NOW,
        previous: {
          date: "2026-03-08",
          amountCents: 150_000,
          description: "Flete de la entrega de marzo",
          means: { kind: "carrier", name: "Transportes del Sur" },
          purchaseIds: ["purchase-1"],
        },
        next: {
          date: "2026-03-09",
          amountCents: 90_000,
          description: "Flete corregido",
          means: { kind: "own_trip" },
          purchaseIds: ["purchase-1", "purchase-2"],
        },
      },
    ]);
  });

  it("keeps one audit record per edit, even when nothing changed", async () => {
    const store = storeWithFreight();
    const unchanged = input({
      date: RECORDED.date,
      amountCents: RECORDED.amountCents,
      description: RECORDED.description,
      means: RECORDED.means,
      purchaseIds: RECORDED.purchaseIds,
    });

    await editFreight({ store, clock: CLOCK }, unchanged);
    await editFreight({ store, clock: CLOCK }, unchanged);

    expect(store.snapshot().edits).toHaveLength(2);
  });

  it("works in one transaction that locks the freight and then the purchases in id order", async () => {
    const store = storeWithFreight();

    await editFreight({ store, clock: CLOCK }, input());

    expect(store.transactionCount).toBe(1);
    expect(store.lockLog).toEqual(["freight:freight-a", "purchases:purchase-1,purchase-2"]);
  });

  it("leaves the purchases it covers as they were", async () => {
    const store = storeWithFreight();
    const purchasesBefore = structuredClone(store.purchases);

    await editFreight({ store, clock: CLOCK }, input());

    expect(store.purchases).toEqual(purchasesBefore);
  });

  it("changes nothing when the audit record cannot be written", async () => {
    const store = storeWithFreight();
    store.failWrite("recordFreightEdit");

    await expect(editFreight({ store, clock: CLOCK }, input())).rejects.toThrow();

    expect(store.snapshot().freights).toEqual([RECORDED]);
    expect(store.snapshot().edits).toEqual([]);
  });

  it("accepts the largest cash amount and today's date", async () => {
    const outcome = await editFreight(
      { store: storeWithFreight(), clock: CLOCK },
      input({ amountCents: MAX_CASH_AMOUNT_CENTS, date: "2026-03-10" }),
    );

    expect(outcome.kind).toBe("edited");
  });

  describe.each([
    ["no_purchases", { purchaseIds: [] }],
    ["invalid_amount", { amountCents: 0 }],
    ["invalid_amount", { amountCents: 10.5 }],
    ["date_in_future", { date: "2026-03-11" }],
    ["invalid_description", { description: "" }],
    ["invalid_description", { description: "a".repeat(PURCHASE_NOTE_MAX_LENGTH + 1) }],
    ["invalid_means", { means: { kind: "carrier", name: "" } }],
  ] satisfies [string, Partial<EditFreightInput>][])("when it is %s", (kind, overrides) => {
    it("refuses without opening a transaction or leaving a trace", async () => {
      const store = storeWithFreight();

      const outcome = await editFreight({ store, clock: CLOCK }, input(overrides));

      expect(outcome).toEqual({ kind });
      expect(store.transactionCount).toBe(0);
      expect(store.snapshot().freights).toEqual([RECORDED]);
      expect(store.snapshot().edits).toEqual([]);
    });
  });

  it("checks the purchases, the amount, the date, the description and the means in that order", async () => {
    const store = storeWithFreight();
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
      refusals.push(await editFreight({ store, clock: CLOCK }, { ...everythingWrong, ...overrides }));
    }

    expect(refusals.map(({ kind }) => kind)).toEqual([
      "no_purchases",
      "invalid_amount",
      "date_in_future",
      "invalid_description",
      "invalid_means",
    ]);
  });

  it("refuses a freight that does not exist or belongs to another branch", async () => {
    const store = storeWithFreight();

    for (const overrides of [{ freightId: "missing" }, { locationId: "branch-2" }]) {
      expect(await editFreight({ store, clock: CLOCK }, input(overrides))).toEqual({
        kind: "freight_not_found",
      });
    }
    expect(store.snapshot().edits).toEqual([]);
  });

  it("reports a missing freight before a missing purchase", async () => {
    const outcome = await editFreight(
      { store: storeWithFreight(), clock: CLOCK },
      input({ freightId: "missing", purchaseIds: ["missing"] }),
    );

    expect(outcome).toEqual({ kind: "freight_not_found" });
  });

  it("refuses a purchase that does not exist or belongs to another branch", async () => {
    const store = storeWithFreight();

    for (const purchaseIds of [["purchase-1", "missing"], ["purchase-elsewhere"]]) {
      expect(await editFreight({ store, clock: CLOCK }, input({ purchaseIds }))).toEqual({
        kind: "purchase_not_found",
      });
    }
    expect(store.snapshot().freights).toEqual([RECORDED]);
    expect(store.snapshot().edits).toEqual([]);
  });

  it("refuses purchases with nothing to proportion the freight to, and reports a missing purchase first", async () => {
    const store = storeWithFreight();

    expect(
      await editFreight({ store, clock: CLOCK }, input({ purchaseIds: ["purchase-free"] })),
    ).toEqual({ kind: "purchases_without_value" });
    expect(
      await editFreight({ store, clock: CLOCK }, input({ purchaseIds: ["purchase-free", "missing"] })),
    ).toEqual({ kind: "purchase_not_found" });
    expect(store.snapshot().edits).toEqual([]);
  });
});
