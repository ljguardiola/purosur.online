import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import {
  type ReceivePurchaseOrderInput,
  type ReceivePurchaseOrderOutcome,
  receivePurchaseOrder,
} from "./receive-purchase-order.js";
import type { RegisterPurchaseLine } from "./register-purchase.js";
import { FakePurchaseOrderReceiptStore } from "./test-support/fake-purchase-order-receipt-store.js";
import {
  type FakePurchaseOrderRow,
  FakePurchaseOrderStore,
  fakeOrderLineId,
} from "./test-support/fake-purchase-order-store.js";
import { FakePurchasingStore } from "./test-support/fake-purchasing-store.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const CLOCK = { now: () => NOW };
const BRANCH = "branch-1";
const ACTOR = "person-1";
const ORDER = "order-9";
const LINE_A = fakeOrderLineId(ORDER, 1);
const LINE_B = fakeOrderLineId(ORDER, 2);

function order(overrides: Partial<FakePurchaseOrderRow> = {}): FakePurchaseOrderRow {
  return {
    id: ORDER,
    supplierId: "supplier-a",
    locationId: BRANCH,
    state: "SENT",
    createdAt: new Date("2026-03-01T10:00:00Z"),
    actorId: "person-1",
    cancelledAt: null,
    sentAt: new Date("2026-03-02T10:00:00Z"),
    sentBy: "person-1",
    lines: [
      {
        productId: "product-a",
        packages: 3,
        quantityPerPackage: 12_000,
        expectedPackagePriceCents: 36_000,
      },
      {
        productId: "product-b",
        packages: 2,
        quantityPerPackage: 5_000,
        expectedPackagePriceCents: 45_000,
      },
    ],
    ...overrides,
  };
}

interface Scenario {
  store: FakePurchaseOrderReceiptStore;
  purchasing: FakePurchasingStore;
  orders: FakePurchaseOrderStore;
}

function scenario(
  options: { order?: FakePurchaseOrderRow; offers?: boolean; supplierActive?: boolean } = {},
): Scenario {
  const purchasing = new FakePurchasingStore();
  const orders = new FakePurchaseOrderStore();
  for (const target of [purchasing, orders]) {
    target.seedSupplier({
      id: "supplier-a",
      name: "Distribuidora Sur",
      cuit: null,
      contact: null,
      note: null,
      active: options.supplierActive ?? true,
      version: 1,
    });
    target.seedProduct({ id: "product-a", name: "Yerba", saleUnit: "UNIT", active: true });
    target.seedProduct({ id: "product-b", name: "Harina", saleUnit: "KG", active: true });
    target.seedProduct({ id: "product-c", name: "Azucar", saleUnit: "UNIT", active: true });
    target.seedProduct({ id: "product-off", name: "Fideos", saleUnit: "UNIT", active: false });
  }
  if (options.offers ?? true) {
    orders.seedOffer("supplier-a", "product-a", {
      link: { quantity: 12_000, saleUnit: "UNIT", relinkRequired: false },
      priceCents: 36_000,
      pricesIncludeVat: true,
      vatRate: null,
    });
    orders.seedOffer("supplier-a", "product-b", {
      link: { quantity: 5_000, saleUnit: "KG", relinkRequired: false },
      priceCents: 45_000,
      pricesIncludeVat: true,
      vatRate: null,
    });
  }
  orders.seedOrder(options.order ?? order());
  return { store: new FakePurchaseOrderReceiptStore(purchasing, orders), purchasing, orders };
}

function lineA(overrides: Partial<RegisterPurchaseLine> = {}): RegisterPurchaseLine {
  return {
    loadedBy: "packages",
    productId: "product-a",
    packages: 3,
    quantityPerPackage: 12_000,
    costPaidCents: 36_000,
    expiresOn: null,
    ...overrides,
  } as RegisterPurchaseLine;
}

function lineB(overrides: Partial<RegisterPurchaseLine> = {}): RegisterPurchaseLine {
  return {
    loadedBy: "quantity",
    productId: "product-b",
    quantity: 10_000,
    costPaidCents: 9_000,
    expiresOn: null,
    ...overrides,
  } as RegisterPurchaseLine;
}

function input(overrides: Partial<ReceivePurchaseOrderInput> = {}): ReceivePurchaseOrderInput {
  return {
    locationId: BRANCH,
    orderId: ORDER,
    actorId: ACTOR,
    purchasedOn: "2026-03-09",
    receiptType: "factura_b",
    receiptNumber: "0001-00001234",
    note: null,
    lines: [lineA(), lineB()],
    ...overrides,
  };
}

function receive(
  { store }: Scenario,
  overrides: Partial<ReceivePurchaseOrderInput> = {},
): Promise<ReceivePurchaseOrderOutcome> {
  return receivePurchaseOrder(
    { store, clock: CLOCK, zoneRules: new FakeZoneRulesSource() },
    input(overrides),
  );
}

function written(scene: Scenario) {
  return {
    purchasing: scene.purchasing.snapshot(),
    orders: scene.orders.orders(),
    receipts: scene.orders.receipts(),
  };
}

describe("receivePurchaseOrder", () => {
  it("creates the purchase of the order's supplier and moves a fully received order to received", async () => {
    const scene = scenario();

    const outcome = await receive(scene);

    const purchase = scene.purchasing.snapshot().purchases[0];
    expect(outcome).toEqual({ kind: "received", purchaseId: purchase?.id, state: "RECEIVED" });
    expect(purchase).toMatchObject({
      supplierId: "supplier-a",
      locationId: BRANCH,
      purchasedOn: "2026-03-09",
      receiptType: "factura_b",
      receiptNumber: "0001-00001234",
      recordedAt: NOW,
      actorId: ACTOR,
    });
    expect(scene.purchasing.snapshot().purchaseLines).toHaveLength(2);
    expect(scene.purchasing.snapshot().receipts).toHaveLength(1);
    expect(scene.orders.orders()[0]).toMatchObject({ state: "RECEIVED", receivedAt: NOW });
    expect(scene.orders.receipts()).toEqual([
      {
        id: expect.any(String),
        purchaseOrderId: ORDER,
        purchaseId: purchase?.id,
        actorId: ACTOR,
        receivedAt: NOW,
        lines: [
          {
            purchaseOrderLineId: LINE_A,
            receivedQuantity: 36_000,
            missingQuantity: 0,
            priceDifferenceCents: 0,
          },
          {
            purchaseOrderLineId: LINE_B,
            receivedQuantity: 10_000,
            missingQuantity: 0,
            priceDifferenceCents: 0,
          },
        ],
      },
    ]);
  });

  it("records what is missing of a short delivery and leaves the order partially received", async () => {
    const scene = scenario();

    const outcome = await receive(scene, {
      lines: [lineA({ packages: 2, costPaidCents: 36_000 }), lineB()],
    });

    expect(outcome).toMatchObject({ kind: "received", state: "PARTIALLY_RECEIVED" });
    expect(scene.orders.orders()[0]).toMatchObject({
      state: "PARTIALLY_RECEIVED",
      receivedAt: NOW,
    });
    expect(scene.orders.receipts()[0]?.lines).toMatchObject([
      { purchaseOrderLineId: LINE_A, receivedQuantity: 24_000, missingQuantity: 12_000 },
      { purchaseOrderLineId: LINE_B, receivedQuantity: 10_000, missingQuantity: 0 },
    ]);
  });

  it("completes the order with a later delivery counting what earlier receipts brought", async () => {
    const scene = scenario({ order: order({ state: "PARTIALLY_RECEIVED" }) });
    scene.orders.seedReceipt({
      id: "order-receipt-0",
      purchaseOrderId: ORDER,
      purchaseId: "purchase-0",
      actorId: ACTOR,
      receivedAt: new Date("2026-03-05T10:00:00Z"),
      lines: [
        {
          purchaseOrderLineId: LINE_A,
          receivedQuantity: 24_000,
          missingQuantity: 12_000,
          priceDifferenceCents: 0,
        },
        {
          purchaseOrderLineId: LINE_B,
          receivedQuantity: 10_000,
          missingQuantity: 0,
          priceDifferenceCents: 0,
        },
      ],
    });

    const outcome = await receive(scene, { lines: [lineA({ packages: 1 })] });

    expect(outcome).toMatchObject({ kind: "received", state: "RECEIVED" });
    expect(scene.orders.orders()[0]?.state).toBe("RECEIVED");
    expect(scene.orders.receipts()).toHaveLength(2);
    expect(scene.orders.receipts()[1]?.lines).toEqual([
      {
        purchaseOrderLineId: LINE_A,
        receivedQuantity: 12_000,
        missingQuantity: 0,
        priceDifferenceCents: 0,
      },
    ]);
  });

  it("keeps a still short order partially received after a later delivery", async () => {
    const scene = scenario({ order: order({ state: "PARTIALLY_RECEIVED" }) });
    scene.orders.seedReceipt({
      id: "order-receipt-0",
      purchaseOrderId: ORDER,
      purchaseId: "purchase-0",
      actorId: ACTOR,
      receivedAt: new Date("2026-03-05T10:00:00Z"),
      lines: [
        {
          purchaseOrderLineId: LINE_A,
          receivedQuantity: 12_000,
          missingQuantity: 24_000,
          priceDifferenceCents: 0,
        },
      ],
    });

    const outcome = await receive(scene, { lines: [lineA({ packages: 1 }), lineB()] });

    expect(outcome).toMatchObject({ kind: "received", state: "PARTIALLY_RECEIVED" });
    expect(scene.orders.receipts()[1]?.lines).toMatchObject([
      { purchaseOrderLineId: LINE_A, receivedQuantity: 12_000, missingQuantity: 12_000 },
      { purchaseOrderLineId: LINE_B, receivedQuantity: 10_000, missingQuantity: 0 },
    ]);
  });

  it("records no missing quantity for more than was ordered", async () => {
    const scene = scenario();

    const outcome = await receive(scene, {
      lines: [lineA({ packages: 4, costPaidCents: 36_000 }), lineB()],
    });

    expect(outcome).toMatchObject({ kind: "received", state: "RECEIVED" });
    expect(scene.orders.receipts()[0]?.lines[0]).toMatchObject({
      receivedQuantity: 48_000,
      missingQuantity: 0,
    });
  });

  it("records the price paid above or below the supplier's list as a difference", async () => {
    const above = scenario();
    await receive(above, {
      lines: [lineA({ costPaidCents: 38_000 }), lineB({ costPaidCents: 8_500 })],
    });

    expect(above.orders.receipts()[0]?.lines).toMatchObject([
      { priceDifferenceCents: 6_000 },
      { priceDifferenceCents: -5_000 },
    ]);
  });

  it("compares the price of a partial delivery with the list for the quantity that arrived", async () => {
    const scene = scenario();

    await receive(scene, { lines: [lineA({ packages: 1, costPaidCents: 37_200 }), lineB()] });

    expect(scene.orders.receipts()[0]?.lines[0]).toMatchObject({ priceDifferenceCents: 1_200 });
  });

  it("records no price difference when the supplier has no list price for the product", async () => {
    const scene = scenario({ offers: false });

    await receive(scene);

    expect(scene.orders.receipts()[0]?.lines).toMatchObject([
      { priceDifferenceCents: null },
      { priceDifferenceCents: null },
    ]);
  });

  it("records no price difference when the supplier's offer cannot be priced for the product", async () => {
    const scene = scenario({ offers: false });
    scene.orders.seedOffer("supplier-a", "product-a", {
      link: { quantity: 12_000, saleUnit: "UNIT", relinkRequired: true },
      priceCents: 36_000,
      pricesIncludeVat: true,
      vatRate: null,
    });

    await receive(scene);

    expect(scene.orders.receipts()[0]?.lines[0]).toMatchObject({ priceDifferenceCents: null });
  });

  it("uses the offer of the package size the order line asked for", async () => {
    const scene = scenario();
    scene.orders.seedOffer("supplier-a", "product-a", {
      link: { quantity: 6_000, saleUnit: "UNIT", relinkRequired: false },
      priceCents: 6_000,
      pricesIncludeVat: true,
      vatRate: null,
    });

    await receive(scene);

    expect(scene.orders.receipts()[0]?.lines[0]).toMatchObject({ priceDifferenceCents: 0 });
  });

  it("purchases a product that is not on the order without a line on the receipt", async () => {
    const scene = scenario();

    const outcome = await receive(scene, {
      lines: [lineA(), lineB(), lineA({ productId: "product-c" })],
    });

    expect(outcome).toMatchObject({ kind: "received", state: "RECEIVED" });
    expect(scene.purchasing.snapshot().purchaseLines).toHaveLength(3);
    expect(scene.orders.receipts()[0]?.lines.map((line) => line.purchaseOrderLineId)).toEqual([
      LINE_A,
      LINE_B,
    ]);
  });

  it("records an ordered product that did not arrive as received zero and wholly missing", async () => {
    const scene = scenario();

    const outcome = await receive(scene, { lines: [lineA()] });

    expect(outcome).toMatchObject({ kind: "received", state: "PARTIALLY_RECEIVED" });
    expect(scene.orders.receipts()[0]?.lines[1]).toEqual({
      purchaseOrderLineId: LINE_B,
      receivedQuantity: 0,
      missingQuantity: 10_000,
      priceDifferenceCents: null,
    });
  });

  it("takes the order's row before the supplier and the products in order", async () => {
    const scene = scenario();

    await receive(scene, { lines: [lineB(), lineA()] });

    expect(scene.store.lockLog).toEqual([
      `order:${ORDER}`,
      "supplier:supplier-a",
      "product:product-a",
      "product:product-b",
    ]);
  });

  describe("refusals", () => {
    async function refuses(
      scene: Scenario,
      overrides: Partial<ReceivePurchaseOrderInput>,
      kind: ReceivePurchaseOrderOutcome["kind"],
    ): Promise<void> {
      const before = written(scene);

      const outcome = await receive(scene, overrides);

      expect(outcome.kind).toBe(kind);
      expect(written(scene)).toEqual(before);
    }

    it("refuses a receipt without lines", async () => {
      await refuses(scenario(), { lines: [] }, "no_lines");
    });

    it("refuses a purchase date in the future", async () => {
      await refuses(scenario(), { purchasedOn: "2026-03-12" }, "date_in_future");
    });

    it("does not find an order of another branch or one that does not exist", async () => {
      await refuses(scenario(), { locationId: "branch-2" }, "not_found");
      await refuses(scenario(), { orderId: "order-none" }, "not_found");
    });

    it.each(["DRAFT", "RECEIVED", "CANCELLED"] as const)(
      "refuses to receive an order that is %s",
      async (state) => {
        await refuses(scenario({ order: order({ state }) }), {}, "not_receivable");
      },
    );

    it("refuses a delivery of none of the ordered products", async () => {
      await refuses(
        scenario(),
        { lines: [lineA({ productId: "product-c" })] },
        "nothing_ordered_received",
      );
    });

    it("refuses when the order's supplier does not exist or is inactive", async () => {
      await refuses(
        scenario({ order: order({ supplierId: "supplier-none" }) }),
        {},
        "supplier_not_found",
      );
      await refuses(scenario({ supplierActive: false }), {}, "supplier_inactive");
    });

    it("refuses a product that does not exist or is inactive", async () => {
      await refuses(
        scenario(),
        { lines: [lineA(), lineA({ productId: "product-none" })] },
        "product_not_found",
      );
      await refuses(
        scenario(),
        { lines: [lineA(), lineA({ productId: "product-off" })] },
        "product_inactive",
      );
    });

    it("refuses a quantity the product's sale unit cannot hold", async () => {
      await refuses(
        scenario(),
        { lines: [lineA({ quantityPerPackage: 1_500 })] },
        "invalid_quantity",
      );
    });
  });

  describe("when a write fails", () => {
    it("leaves no purchase, stock or receipt behind", async () => {
      const scene = scenario();
      scene.orders.failWriteAtCall("markPurchaseOrderReceived", 1);
      const before = written(scene);

      await expect(receive(scene)).rejects.toThrow("markPurchaseOrderReceived failed");

      expect(written(scene)).toEqual(before);
    });

    it("leaves the order untouched when the purchase's stock cannot be received", async () => {
      const scene = scenario();
      scene.purchasing.failWriteAtCall("receiveStock", 1);
      const before = written(scene);

      await expect(receive(scene)).rejects.toThrow("receiveStock failed");

      expect(written(scene)).toEqual(before);
    });
  });
});
