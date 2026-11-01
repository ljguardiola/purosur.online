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
    },
  ],
};

describe("getPurchaseOrder", () => {
  it("answers the order with its lines", async () => {
    const reader = new FakePurchaseOrderReader([detail]);
    const { locationId: _locationId, ...expected } = detail;

    expect(await getPurchaseOrder(reader, { locationId: "branch-1", orderId: "order-1" })).toEqual({
      kind: "found",
      order: expected,
    });
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
