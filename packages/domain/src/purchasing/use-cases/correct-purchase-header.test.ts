import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { correctPurchaseHeader } from "./correct-purchase-header.js";
import {
  ACTOR,
  BRANCH,
  CLOCK,
  NOW,
  PURCHASE_ID,
  storeWithRegisteredPurchase,
} from "./test-support/purchase-correction-scenario.js";

const header = {
  purchasedOn: "2026-03-05",
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  note: "Entrega de la tarde",
} as const;

function input(overrides = {}) {
  return { purchaseId: PURCHASE_ID, locationId: BRANCH, actorId: ACTOR, ...header, ...overrides };
}

function ports(store = storeWithRegisteredPurchase()) {
  return { store, clock: CLOCK, zoneRules: new FakeZoneRulesSource() };
}

describe("correctPurchaseHeader", () => {
  it("corrects the receipt number and the date, leaving the supplier and the lines", async () => {
    const p = ports();
    const before = p.store.snapshot();

    const outcome = await correctPurchaseHeader(
      p,
      input({ receiptNumber: "0001-00001243", purchasedOn: "2026-03-04" }),
    );

    expect(outcome).toEqual({
      kind: "corrected",
      purchase: {
        id: PURCHASE_ID,
        purchasedOn: "2026-03-04",
        receiptType: "factura_b",
        receiptNumber: "0001-00001243",
        note: "Entrega de la tarde",
      },
    });
    const state = p.store.snapshot();
    expect(state.purchases).toEqual([
      { ...before.purchases[0], purchasedOn: "2026-03-04", receiptNumber: "0001-00001243" },
    ]);
    expect(state.purchaseLines).toEqual(before.purchaseLines);
  });

  it("corrects the receipt type together with its number, and the note", async () => {
    const p = ports();

    await correctPurchaseHeader(
      p,
      input({ receiptType: "sin_comprobante", receiptNumber: null, note: null }),
    );

    expect(p.store.snapshot().purchases[0]).toMatchObject({
      receiptType: "sin_comprobante",
      receiptNumber: null,
      note: null,
    });
  });

  it("records only the changed fields with their previous and new values", async () => {
    const p = ports();

    await correctPurchaseHeader(
      p,
      input({ receiptNumber: "0001-00001243", note: null, purchasedOn: "2026-03-04" }),
    );

    expect(p.store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "header",
          changes: [
            { field: "purchasedOn", previous: "2026-03-05", next: "2026-03-04" },
            { field: "receiptNumber", previous: "0001-00001234", next: "0001-00001243" },
            { field: "note", previous: "Entrega de la tarde", next: null },
          ],
        },
      },
    ]);
  });

  it("records a changed receipt type as its own field", async () => {
    const p = ports();

    await correctPurchaseHeader(p, input({ receiptType: "remito" }));

    expect(p.store.snapshot().corrections[0]?.change).toEqual({
      kind: "header",
      changes: [{ field: "receiptType", previous: "factura_b", next: "remito" }],
    });
  });

  it("re-dates the lots of every line when the date changes, last in the transaction", async () => {
    const p = ports();

    await correctPurchaseHeader(p, input({ purchasedOn: "2026-03-04" }));

    expect(p.store.snapshot().lotRedatings).toEqual([
      { locationId: BRANCH, purchaseLineIds: ["line-1", "line-2"], purchasedOn: "2026-03-04" },
    ]);
    expect(p.store.lockLog).toEqual([`purchase:${PURCHASE_ID}`, "lot redating"]);
  });

  it("leaves the lots alone when the date does not change", async () => {
    const p = ports();

    await correctPurchaseHeader(p, input({ note: "Otra nota" }));

    expect(p.store.snapshot().lotRedatings).toEqual([]);
  });

  it("answers unchanged, writing nothing and recording no change, when nothing differs", async () => {
    const p = ports();
    const before = p.store.snapshot();

    const outcome = await correctPurchaseHeader(p, input());

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(p.store.snapshot()).toEqual(before);
  });

  it("refuses a date after today in Argentina before reaching the store", async () => {
    const p = ports();

    const outcome = await correctPurchaseHeader(p, input({ purchasedOn: "2026-03-11" }));

    expect(outcome).toEqual({ kind: "date_in_future" });
    expect(p.store.transactionCount).toBe(0);
  });

  it("accepts today's date", async () => {
    const p = ports();

    const outcome = await correctPurchaseHeader(p, input({ purchasedOn: "2026-03-10" }));

    expect(outcome.kind).toBe("corrected");
  });

  it("answers not found for a purchase that does not exist", async () => {
    const p = ports();

    const outcome = await correctPurchaseHeader(p, input({ purchaseId: "missing" }));

    expect(outcome).toEqual({ kind: "purchase_not_found" });
  });

  it("answers not found for a purchase of another branch, changing nothing", async () => {
    const p = ports();
    const before = p.store.snapshot();

    const outcome = await correctPurchaseHeader(
      p,
      input({ locationId: "branch-2", note: "Otra nota" }),
    );

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(p.store.snapshot()).toEqual(before);
  });

  it.each([
    ["updatePurchaseHeader", 1],
    ["redatePurchasedLots", 1],
    ["recordPurchaseCorrection", 1],
  ] as const)("rolls back what was written when %s fails at call %s", async (operation, call) => {
    const p = ports();
    const before = p.store.snapshot();
    p.store.failWriteAtCall(operation, call);

    await expect(
      correctPurchaseHeader(p, input({ purchasedOn: "2026-03-04", note: null })),
    ).rejects.toThrow(operation);

    expect(p.store.snapshot()).toEqual(before);
  });
});
