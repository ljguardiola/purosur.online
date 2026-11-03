import { describe, expect, it } from "vitest";
import { getPurchaseOrder } from "./get-purchase-order.js";
import { FakePurchaseOrderReader } from "./test-support/fake-purchase-order-reader.js";

const detail = {
  id: "order-1",
  locationId: "branch-1",
  supplier: { id: "supplier-a", name: "Distribuidora Sur" },
  state: "DRAFT" as const,
  createdAt: new Date("2026-03-01T10:00:00Z"),
  lines: [
    {
      product: {
        id: "product-a",
        name: "Yerba",
        saleUnit: "UNIT" as const,
        brandName: "Piragüé",
        netContent: { quantity: 500, unit: "G" as const },
      },
      packages: 3,
      quantityPerPackage: 12_000,
      expectedPackagePriceCents: null,
      supplierItem: { code: "YER-500", description: "Yerba mate 500 g x12" },
      receivedQuantity: 0,
    },
  ],
  receipts: [],
};

describe("getPurchaseOrder", () => {
  it("answers the order with its lines", async () => {
    const reader = new FakePurchaseOrderReader([detail]);
    const { locationId: _locationId, ...expected } = detail;

    expect(await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" })).toEqual({
      kind: "found",
      order: {
        ...expected,
        lines: [{ ...expected.lines[0], expectedTotalCents: null, outstandingQuantity: 36_000 }],
        expectedTotalCents: 0,
        hasUnpricedLine: true,
        editable: true,
        cancellable: true,
        shareable: true,
        documentShareable: true,
        receivable: false,
      },
    });
  });

  it("answers each line's total and the order's total from the expected prices", async () => {
    const [line] = detail.lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }
    const reader = new FakePurchaseOrderReader([
      {
        ...detail,
        lines: [
          { ...line, packages: 3, expectedPackagePriceCents: 1_250 },
          { ...line, packages: 2, expectedPackagePriceCents: 400 },
        ],
      },
    ]);

    const outcome = await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" });

    expect(outcome.kind === "found" && outcome.order).toMatchObject({
      lines: [{ expectedTotalCents: 3_750 }, { expectedTotalCents: 800 }],
      expectedTotalCents: 4_550,
      hasUnpricedLine: false,
    });
  });

  it("answers that a cancelled order can be neither edited, shared, sent as a document nor cancelled", async () => {
    const reader = new FakePurchaseOrderReader([{ ...detail, state: "CANCELLED" }]);

    const outcome = await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" });

    expect(outcome.kind === "found" && outcome.order).toMatchObject({
      editable: false,
      shareable: false,
      documentShareable: false,
      cancellable: false,
    });
  });

  it("answers that a sent order can only be sent as a document again and cancelled", async () => {
    const reader = new FakePurchaseOrderReader([{ ...detail, state: "SENT" }]);

    const outcome = await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" });

    expect(outcome.kind === "found" && outcome.order).toMatchObject({
      editable: false,
      shareable: false,
      documentShareable: true,
      cancellable: true,
    });
  });

  it("answers what each line still has outstanding after the earlier receipts", async () => {
    const [line] = detail.lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }
    const reader = new FakePurchaseOrderReader([
      {
        ...detail,
        state: "PARTIALLY_RECEIVED",
        lines: [
          { ...line, receivedQuantity: 10_000 },
          { ...line, receivedQuantity: 40_000 },
        ],
      },
    ]);

    const outcome = await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" });

    expect(
      outcome.kind === "found" && outcome.order.lines.map((l) => l.outstandingQuantity),
    ).toEqual([26_000, 0]);
  });

  it("answers the receipts as the reader lists them", async () => {
    const receipts = [
      {
        id: "receipt-1",
        receivedAt: new Date("2026-03-05T10:00:00Z"),
        purchaseId: "purchase-1",
        lines: [
          {
            productId: "product-a",
            receivedQuantity: 10_000,
            missingQuantity: 26_000,
            priceDifferenceCents: -50,
          },
        ],
      },
    ];
    const reader = new FakePurchaseOrderReader([
      { ...detail, state: "PARTIALLY_RECEIVED", receipts },
    ]);

    const outcome = await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" });

    expect(outcome.kind === "found" && outcome.order.receipts).toEqual(receipts);
  });

  it.each([
    ["DRAFT", false],
    ["SENT", true],
    ["PARTIALLY_RECEIVED", true],
    ["RECEIVED", false],
    ["CANCELLED", false],
  ] as const)("answers that an order %s is receivable: %s", async (state, receivable) => {
    const reader = new FakePurchaseOrderReader([{ ...detail, state }]);

    const outcome = await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" });

    expect(outcome.kind === "found" && outcome.order.receivable).toBe(receivable);
  });

  it("answers a line without an item of the supplier linked to its product", async () => {
    const [line] = detail.lines;
    if (!line) {
      throw new Error("the fixture has a line");
    }
    const reader = new FakePurchaseOrderReader([
      { ...detail, lines: [{ ...line, supplierItem: null }] },
    ]);

    const outcome = await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" });

    expect(outcome.kind === "found" && outcome.order.lines[0]?.supplierItem).toBeNull();
  });

  it("does not find an order of another branch or one that does not exist", async () => {
    const reader = new FakePurchaseOrderReader([detail]);

    expect(await getPurchaseOrder(reader, { locationId: "branch-2", orderId: "order-1" })).toEqual({
      kind: "not_found",
    });
    expect(await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "nope" })).toEqual({
      kind: "not_found",
    });
  });
});
