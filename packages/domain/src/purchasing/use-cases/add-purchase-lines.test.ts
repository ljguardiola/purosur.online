import { describe, expect, it } from "vitest";
import { addPurchaseLines } from "./add-purchase-lines.js";
import type { RegisterPurchaseLine } from "./purchase-line-resolution.js";
import {
  ACTOR,
  BRANCH,
  CLOCK,
  NOW,
  PURCHASE_ID,
  storeWithRegisteredPurchase,
} from "./test-support/purchase-correction-scenario.js";

function packagesLine(overrides: Partial<RegisterPurchaseLine> = {}): RegisterPurchaseLine {
  return {
    loadedBy: "packages",
    productId: "product-a",
    packages: 1,
    quantityPerPackage: 10_000,
    costPaidCents: 500_000,
    lotNumber: "L-9",
    expiresOn: "2027-01-31",
    ...overrides,
  } as RegisterPurchaseLine;
}

function quantityLine(overrides: Partial<RegisterPurchaseLine> = {}): RegisterPurchaseLine {
  return {
    loadedBy: "quantity",
    productId: "product-b",
    quantity: 3_000,
    costPaidCents: 120_000,
    lotNumber: null,
    expiresOn: null,
    ...overrides,
  } as RegisterPurchaseLine;
}

function input(lines: RegisterPurchaseLine[], overrides = {}) {
  return { purchaseId: PURCHASE_ID, locationId: BRANCH, actorId: ACTOR, lines, ...overrides };
}

describe("addPurchaseLines", () => {
  it("adds the lines after the last recorded one, leaving the recorded lines as they were", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await addPurchaseLines(
      { store, clock: CLOCK },
      input([packagesLine(), quantityLine()]),
    );

    expect(outcome).toEqual({
      kind: "added",
      purchaseId: PURCHASE_ID,
      lines: [
        {
          id: "purchase-line-1",
          productId: "product-a",
          packages: 1,
          quantity: 10_000,
          costPaidCents: 500_000,
          quantityPerPackage: 10_000,
          lotNumber: "L-9",
          expiresOn: "2027-01-31",
        },
        {
          id: "purchase-line-2",
          productId: "product-b",
          packages: null,
          quantity: 3_000,
          costPaidCents: 120_000,
          quantityPerPackage: 1_000,
          lotNumber: null,
          expiresOn: null,
        },
      ],
    });
    const state = store.snapshot();
    expect(state.purchaseLines.slice(0, 2)).toEqual(before.purchaseLines);
    expect(
      state.purchaseLines.slice(2).map(({ position, productId }) => [position, productId]),
    ).toEqual([
      [3, "product-a"],
      [4, "product-b"],
    ]);
    expect(state.purchases).toEqual(before.purchases);
    expect(store.transactionCount).toBe(1);
  });

  it("receives the added lines now, dated by the purchase's date and not by today", async () => {
    const store = storeWithRegisteredPurchase();

    await addPurchaseLines({ store, clock: CLOCK }, input([packagesLine()]));

    expect(store.snapshot().receipts).toEqual([
      {
        locationId: BRANCH,
        occurredAt: NOW,
        purchasedOn: "2026-03-05",
        actorId: ACTOR,
        lines: [
          {
            purchaseLineId: "purchase-line-1",
            productId: "product-a",
            quantity: 10_000,
            costPaidCents: 500_000,
            quantityPerPackage: 10_000,
            lotNumber: "L-9",
            expiresOn: "2027-01-31",
          },
        ],
      },
    ]);
  });

  it("postpones the price review of each added product, once each", async () => {
    const store = storeWithRegisteredPurchase();

    await addPurchaseLines(
      { store, clock: CLOCK },
      input([quantityLine(), packagesLine(), packagesLine({ packages: 2 })]),
    );

    expect(store.snapshot().priceReviewPostponements).toEqual([
      {
        locationId: BRANCH,
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        postponedAt: NOW,
        productIds: ["product-a", "product-b"],
      },
    ]);
  });

  it("records one audit entry naming the added lines, by whom and when", async () => {
    const store = storeWithRegisteredPurchase();

    await addPurchaseLines({ store, clock: CLOCK }, input([packagesLine(), quantityLine()]));

    expect(store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "lines_added",
          lines: [
            {
              lineId: "purchase-line-1",
              productId: "product-a",
              quantity: 10_000,
              costPaidCents: 500_000,
              lotNumber: "L-9",
              expiresOn: "2027-01-31",
            },
            {
              lineId: "purchase-line-2",
              productId: "product-b",
              quantity: 3_000,
              costPaidCents: 120_000,
              lotNumber: null,
              expiresOn: null,
            },
          ],
        },
      },
    ]);
  });

  it("locks the purchase, then holds the products each in id order and once, and receives the stock last", async () => {
    const store = storeWithRegisteredPurchase();

    await addPurchaseLines(
      { store, clock: CLOCK },
      input([quantityLine(), packagesLine(), packagesLine({ packages: 2 })]),
    );

    expect(store.lockLog).toEqual([
      `purchase:${PURCHASE_ID}`,
      "product:product-a",
      "product:product-b",
      "stock receipt",
    ]);
  });

  it("refuses no lines before reaching the store", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await addPurchaseLines({ store, clock: CLOCK }, input([]));

    expect(outcome).toEqual({ kind: "no_lines" });
    expect(store.transactionCount).toBe(0);
  });

  it("answers not found for a purchase that does not exist, holding no product", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await addPurchaseLines(
      { store, clock: CLOCK },
      input([packagesLine()], { purchaseId: "missing" }),
    );

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(store.lockLog).toEqual(["purchase:missing"]);
  });

  it("answers not found for a purchase of another branch, changing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await addPurchaseLines(
      { store, clock: CLOCK },
      input([packagesLine()], { locationId: "branch-2" }),
    );

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  describe("refuses a line like registering a purchase and changes nothing", () => {
    it.each([
      [
        "a product that does not exist",
        packagesLine({ productId: "missing" }),
        "product_not_found",
      ],
      [
        "a quantity that does not fit the unit",
        quantityLine({ quantity: 1_500, productId: "product-a" }),
        "invalid_quantity",
      ],
    ] as const)("%s", async (_name, line, kind) => {
      const store = storeWithRegisteredPurchase();
      const before = store.snapshot();

      const outcome = await addPurchaseLines(
        { store, clock: CLOCK },
        input([packagesLine(), line]),
      );

      expect(outcome).toEqual({ kind, lineIndex: 1 });
      expect(store.snapshot()).toEqual(before);
    });

    it("an inactive product", async () => {
      const store = storeWithRegisteredPurchase();
      store.seedProduct({ id: "product-c", name: "Azucar", saleUnit: "UNIT", active: false });
      const before = store.snapshot();

      const outcome = await addPurchaseLines(
        { store, clock: CLOCK },
        input([packagesLine({ productId: "product-c" })]),
      );

      expect(outcome).toEqual({ kind: "product_inactive", lineIndex: 0 });
      expect(store.snapshot()).toEqual(before);
    });
  });

  it("does not check the supplier again", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await addPurchaseLines({ store, clock: CLOCK }, input([packagesLine()]));

    expect(outcome.kind).toBe("added");
    expect(store.lockLog).not.toContain("supplier:supplier-a");
  });

  it.each([
    ["insertPurchaseLine", 1],
    ["insertPurchaseLine", 2],
    ["postponePriceReviews", 1],
    ["receiveStock", 1],
    ["recordPurchaseCorrection", 1],
  ] as const)("rolls back what was written when %s fails at call %s", async (operation, call) => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();
    store.failWriteAtCall(operation, call);

    await expect(
      addPurchaseLines({ store, clock: CLOCK }, input([packagesLine(), quantityLine()])),
    ).rejects.toThrow(operation);

    expect(store.snapshot()).toEqual(before);
  });
});
