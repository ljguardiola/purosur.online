import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import {
  type RegisterPurchaseInput,
  type RegisterPurchaseLine,
  registerPurchase,
} from "./register-purchase.js";
import { FakePurchasingStore } from "./test-support/fake-purchasing-store.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const CLOCK = { now: () => NOW };
const ACTOR = "person-1";
const BRANCH = "branch-1";

function storeWithCatalog(): FakePurchasingStore {
  const store = new FakePurchasingStore();
  store.seedSupplier({
    id: "supplier-a",
    name: "Distribuidora Sur",
    cuit: null,
    contact: null,
    note: null,
    active: true,
    version: 1,
  });
  store.seedProduct({ id: "product-a", name: "Yerba", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "product-b", name: "Harina", saleUnit: "KG", active: true });
  store.seedPackaging({
    id: "packaging-a",
    productId: "product-a",
    name: "Caja x 12",
    quantityPerPackage: 12_000,
    saleUnit: "UNIT",
    active: true,
    version: 1,
  });
  store.seedPackaging({
    id: "packaging-b",
    productId: "product-b",
    name: "Bolsa x 25 kg",
    quantityPerPackage: 25_000,
    saleUnit: "KG",
    active: true,
    version: 1,
  });
  return store;
}

function packagedLine(overrides: Partial<RegisterPurchaseLine> = {}): RegisterPurchaseLine {
  return {
    loadedBy: "packaging",
    productId: "product-a",
    packagingId: "packaging-a",
    packages: 2,
    costPaidCents: 1_450_050,
    lotNumber: null,
    expiresOn: null,
    ...overrides,
  } as RegisterPurchaseLine;
}

function quantityLine(overrides: Partial<RegisterPurchaseLine> = {}): RegisterPurchaseLine {
  return {
    loadedBy: "quantity",
    productId: "product-b",
    quantity: 2_500,
    costPaidCents: 90_000,
    lotNumber: null,
    expiresOn: null,
    ...overrides,
  } as RegisterPurchaseLine;
}

function purchase(overrides: Partial<RegisterPurchaseInput> = {}): RegisterPurchaseInput {
  return {
    supplierId: "supplier-a",
    purchasedOn: "2026-03-09",
    receiptType: "factura_b",
    receiptNumber: "0001-00001234",
    note: "Entrega de la tarde",
    lines: [packagedLine()],
    actorId: ACTOR,
    locationId: BRANCH,
    ...overrides,
  };
}

describe("registerPurchase", () => {
  it("registers a line loaded by packaging with its quantity, its exact cost pair and its stock receipt", async () => {
    const store = storeWithCatalog();

    const outcome = await registerPurchase({ store, clock: CLOCK }, purchase());

    expect(outcome).toEqual({
      kind: "registered",
      purchase: {
        id: "purchase-1",
        supplierId: "supplier-a",
        locationId: BRANCH,
        purchasedOn: "2026-03-09",
        receiptType: "factura_b",
        receiptNumber: "0001-00001234",
        note: "Entrega de la tarde",
        recordedAt: NOW,
        lines: [
          {
            id: "purchase-line-2",
            productId: "product-a",
            packagingId: "packaging-a",
            packages: 2,
            quantity: 24_000,
            costPaidCents: 1_450_050,
            quantityPerPackage: 12_000,
            lotNumber: null,
            expiresOn: null,
          },
        ],
      },
    });
    const state = store.snapshot();
    expect(state.purchases).toEqual([
      {
        id: "purchase-1",
        supplierId: "supplier-a",
        locationId: BRANCH,
        purchasedOn: "2026-03-09",
        receiptType: "factura_b",
        receiptNumber: "0001-00001234",
        note: "Entrega de la tarde",
        recordedAt: NOW,
        actorId: ACTOR,
      },
    ]);
    expect(state.purchaseLines).toEqual([
      {
        id: "purchase-line-2",
        purchaseId: "purchase-1",
        position: 1,
        productId: "product-a",
        packagingId: "packaging-a",
        packages: 2,
        quantity: 24_000,
        costPaidCents: 1_450_050,
        quantityPerPackage: 12_000,
        lotNumber: null,
        expiresOn: null,
      },
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("stores the lines with positions 1 to n in the order they were entered", async () => {
    const store = storeWithCatalog();

    await registerPurchase(
      { store, clock: CLOCK },
      purchase({
        lines: [
          packagedLine(),
          quantityLine(),
          quantityLine({ productId: "product-a", quantity: 3_000 }),
        ],
      }),
    );

    expect(
      store.snapshot().purchaseLines.map(({ position, productId }) => [position, productId]),
    ).toEqual([
      [1, "product-a"],
      [2, "product-b"],
      [3, "product-a"],
    ]);
  });

  it("registers a line loaded by quantity paid per sale unit, with no packaging", async () => {
    const store = storeWithCatalog();

    const outcome = await registerPurchase(
      { store, clock: CLOCK },
      purchase({ lines: [quantityLine()] }),
    );

    expect(outcome).toMatchObject({
      kind: "registered",
      purchase: {
        lines: [
          {
            productId: "product-b",
            packagingId: null,
            packages: null,
            quantity: 2_500,
            costPaidCents: 90_000,
            quantityPerPackage: 1_000,
          },
        ],
      },
    });
    expect(store.snapshot().receipts).toMatchObject([
      { lines: [{ costPaidCents: 90_000, quantityPerPackage: 1_000 }] },
    ]);
  });

  it("stores the exact cost pair without rounding it", async () => {
    const store = storeWithCatalog();
    store.seedPackaging({
      id: "packaging-c",
      productId: "product-a",
      name: "Pack x 3",
      quantityPerPackage: 3_000,
      saleUnit: "UNIT",
      active: true,
      version: 1,
    });

    await registerPurchase(
      { store, clock: CLOCK },
      purchase({ lines: [packagedLine({ packagingId: "packaging-c", costPaidCents: 10_001 })] }),
    );

    const state = store.snapshot();
    expect(state.purchaseLines).toMatchObject([
      { costPaidCents: 10_001, quantityPerPackage: 3_000 },
    ]);
    expect(state.receipts).toMatchObject([
      { lines: [{ costPaidCents: 10_001, quantityPerPackage: 3_000 }] },
    ]);
  });

  it("receives every line's stock at the recording instant, not the purchase date, with its purchase line, cost pair, lot number and expiry", async () => {
    const store = storeWithCatalog();

    await registerPurchase(
      { store, clock: CLOCK },
      purchase({
        purchasedOn: "2026-01-02",
        lines: [
          packagedLine({ lotNumber: "L-17", expiresOn: "2027-01-31" }),
          quantityLine({ lotNumber: null, expiresOn: null }),
        ],
      }),
    );

    expect(store.snapshot().receipts).toEqual([
      {
        locationId: BRANCH,
        occurredAt: NOW,
        actorId: ACTOR,
        lines: [
          {
            purchaseLineId: "purchase-line-2",
            productId: "product-a",
            quantity: 24_000,
            costPaidCents: 1_450_050,
            quantityPerPackage: 12_000,
            lotNumber: "L-17",
            expiresOn: "2027-01-31",
          },
          {
            purchaseLineId: "purchase-line-3",
            productId: "product-b",
            quantity: 2_500,
            costPaidCents: 90_000,
            quantityPerPackage: 1_000,
            lotNumber: null,
            expiresOn: null,
          },
        ],
      },
    ]);
  });

  it("accepts an expiry that is already past and a purchase dated today", async () => {
    const store = storeWithCatalog();

    const outcome = await registerPurchase(
      { store, clock: CLOCK },
      purchase({ purchasedOn: "2026-03-10", lines: [packagedLine({ expiresOn: "2020-01-01" })] }),
    );

    expect(outcome.kind).toBe("registered");
  });

  it("takes today from Argentina's calendar", async () => {
    const store = storeWithCatalog();
    const lateEvening = { now: () => new Date("2026-03-11T01:30:00Z") };

    const outcome = await registerPurchase(
      { store, clock: lateEvening },
      purchase({ purchasedOn: "2026-03-10" }),
    );

    expect(outcome.kind).toBe("registered");
  });

  it("locks the supplier, then holds the products and locks the packagings, each in id order and once, and receives the stock last", async () => {
    const store = storeWithCatalog();

    await registerPurchase(
      { store, clock: CLOCK },
      purchase({
        lines: [
          quantityLine(),
          packagedLine({ productId: "product-b", packagingId: "packaging-b" }),
          packagedLine(),
          packagedLine({ packages: 1 }),
        ],
      }),
    );

    expect(store.lockLog).toEqual([
      "supplier:supplier-a",
      "product:product-a",
      "product:product-b",
      "packaging:packaging-a",
      "packaging:packaging-b",
      "stock receipt",
    ]);
  });

  it("refuses a purchase with no lines before reaching the store", async () => {
    const store = storeWithCatalog();

    const outcome = await registerPurchase({ store, clock: CLOCK }, purchase({ lines: [] }));

    expect(outcome).toEqual({ kind: "no_lines" });
    expect(store.transactionCount).toBe(0);
  });

  it("refuses a purchase dated after today in Argentina before reaching the store", async () => {
    const store = storeWithCatalog();

    const outcome = await registerPurchase(
      { store, clock: CLOCK },
      purchase({ purchasedOn: "2026-03-11" }),
    );

    expect(outcome).toEqual({ kind: "date_in_future" });
    expect(store.transactionCount).toBe(0);
  });

  it("refuses an unknown supplier after locking only it", async () => {
    const store = storeWithCatalog();

    const outcome = await registerPurchase(
      { store, clock: CLOCK },
      purchase({ supplierId: "missing" }),
    );

    expect(outcome).toEqual({ kind: "supplier_not_found" });
    expect(store.lockLog).toEqual(["supplier:missing"]);
  });

  it("refuses a deactivated supplier", async () => {
    const store = storeWithCatalog();
    store.seedSupplier({
      id: "supplier-old",
      name: "Cerrada",
      cuit: null,
      contact: null,
      note: null,
      active: false,
      version: 2,
    });

    const outcome = await registerPurchase(
      { store, clock: CLOCK },
      purchase({ supplierId: "supplier-old" }),
    );

    expect(outcome).toEqual({ kind: "supplier_inactive" });
    expect(store.lockLog).toEqual(["supplier:supplier-old"]);
  });

  describe("a line that cannot be registered", () => {
    function inactiveProductStore(): FakePurchasingStore {
      const store = storeWithCatalog();
      store.seedProduct({ id: "product-old", name: "Antiguo", saleUnit: "UNIT", active: false });
      return store;
    }

    it("refuses a missing product, naming its line", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [packagedLine(), quantityLine({ productId: "missing" })] }),
      );

      expect(outcome).toEqual({ kind: "product_not_found", lineIndex: 1 });
    });

    it("refuses a deactivated product, naming its line", async () => {
      const store = inactiveProductStore();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({
          lines: [packagedLine(), packagedLine(), quantityLine({ productId: "product-old" })],
        }),
      );

      expect(outcome).toEqual({ kind: "product_inactive", lineIndex: 2 });
    });

    it("names the first line with a missing product when several have one", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({
          lines: [
            packagedLine(),
            quantityLine({ productId: "zzz" }),
            quantityLine({ productId: "aaa" }),
          ],
        }),
      );

      expect(outcome).toEqual({ kind: "product_not_found", lineIndex: 1 });
    });

    it("refuses a missing packaging, naming its line", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [quantityLine(), packagedLine({ packagingId: "missing" })] }),
      );

      expect(outcome).toEqual({ kind: "packaging_not_found", lineIndex: 1 });
    });

    it("refuses a packaging of another product", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [packagedLine({ packagingId: "packaging-b" })] }),
      );

      expect(outcome).toEqual({ kind: "packaging_not_found", lineIndex: 0 });
    });

    it("refuses a deactivated packaging", async () => {
      const store = storeWithCatalog();
      store.seedPackaging({
        id: "packaging-old",
        productId: "product-a",
        name: "Vieja",
        quantityPerPackage: 6_000,
        saleUnit: "UNIT",
        active: false,
        version: 2,
      });

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [packagedLine({ packagingId: "packaging-old" })] }),
      );

      expect(outcome).toEqual({ kind: "packaging_inactive", lineIndex: 0 });
    });

    it("refuses a packaging stated in a sale unit the product no longer has", async () => {
      const store = storeWithCatalog();
      store.seedPackaging({
        id: "packaging-stale",
        productId: "product-a",
        name: "Por kilo",
        quantityPerPackage: 5_000,
        saleUnit: "KG",
        active: true,
        version: 1,
      });

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [packagedLine({ packagingId: "packaging-stale" })] }),
      );

      expect(outcome).toEqual({ kind: "packaging_sale_unit_changed", lineIndex: 0 });
    });

    it.each([
      ["a fractional unit", "product-a", 1_500],
      ["zero", "product-b", 0],
      ["a negative quantity", "product-b", -1_000],
      ["a fraction of a thousandth", "product-b", 1.5],
      ["more than a movement may hold", "product-b", MAX_STOCK_QUANTITY + 1],
    ])("refuses a quantity of %s", async (_name, productId, quantity) => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [packagedLine(), quantityLine({ productId, quantity })] }),
      );

      expect(outcome).toEqual({ kind: "invalid_quantity", lineIndex: 1 });
    });

    it("accepts a gram of a product sold by the kilo and a whole unit", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({
          lines: [
            quantityLine({ quantity: 1 }),
            quantityLine({ productId: "product-a", quantity: 1_000 }),
          ],
        }),
      );

      expect(outcome.kind).toBe("registered");
    });

    it("refuses packages whose quantity is more than a movement may hold", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [packagedLine({ packages: 200_000 })] }),
      );

      expect(outcome).toEqual({ kind: "invalid_quantity", lineIndex: 0 });
    });

    it("accepts the largest quantity a movement may hold", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [quantityLine({ quantity: MAX_STOCK_QUANTITY })] }),
      );

      expect(outcome.kind).toBe("registered");
    });

    it("leaves nothing written when any line is refused, even after earlier lines were valid", async () => {
      const store = storeWithCatalog();

      await registerPurchase(
        { store, clock: CLOCK },
        purchase({ lines: [packagedLine(), quantityLine({ quantity: 0 })] }),
      );

      const state = store.snapshot();
      expect(state.purchases).toEqual([]);
      expect(state.purchaseLines).toEqual([]);
      expect(state.receipts).toEqual([]);
    });

    it("keeps its checks in order: product, then packaging, then quantity", async () => {
      const store = storeWithCatalog();

      const outcome = await registerPurchase(
        { store, clock: CLOCK },
        purchase({
          lines: [
            quantityLine({ quantity: 0 }),
            packagedLine({ packagingId: "missing" }),
            quantityLine({ productId: "missing" }),
          ],
        }),
      );

      expect(outcome).toEqual({ kind: "product_not_found", lineIndex: 2 });
    });
  });

  it.each([
    ["insertPurchase", 1],
    ["insertPurchaseLine", 2],
    ["receiveStock", 1],
  ] as const)("rolls back what was written when %s fails at call %s", async (operation, call) => {
    const store = storeWithCatalog();
    const before = store.snapshot();
    store.failWriteAtCall(operation, call);
    const twoLines = purchase({ lines: [packagedLine(), quantityLine()] });

    await expect(registerPurchase({ store, clock: CLOCK }, twoLines)).rejects.toThrow(operation);

    expect(store.snapshot()).toEqual(before);
  });
});
