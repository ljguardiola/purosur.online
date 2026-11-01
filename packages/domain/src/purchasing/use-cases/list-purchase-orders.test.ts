import { describe, expect, it } from "vitest";
import { listPurchaseOrders } from "./list-purchase-orders.js";
import {
  type FakePurchaseOrder,
  FakePurchaseOrderReader,
} from "./test-support/fake-purchase-order-reader.js";

const BRANCH = "branch-1";

function order(overrides: Partial<FakePurchaseOrder> = {}): FakePurchaseOrder {
  return {
    id: "order-1",
    locationId: BRANCH,
    supplier: { id: "supplier-a", name: "Distribuidora Sur" },
    state: "DRAFT",
    createdAt: new Date("2026-03-01T10:00:00Z"),
    lines: [],
    ...overrides,
  };
}

function line(packages: number, expectedPackagePriceCents: number | null) {
  return {
    product: { id: `product-${packages}`, name: "Yerba", saleUnit: "UNIT" as const, brandName: null, netContent: null },
    packages,
    quantityPerPackage: 12_000,
    expectedPackagePriceCents,
  };
}

describe("listPurchaseOrders", () => {
  it("summarizes each order with its line count and expected total", async () => {
    const reader = new FakePurchaseOrderReader([
      order({ lines: [line(3, 1_250), line(2, 400)] }),
    ]);

    expect(await listPurchaseOrders(reader, { locationId: BRANCH })).toEqual([
      {
        id: "order-1",
        supplier: { id: "supplier-a", name: "Distribuidora Sur" },
        state: "DRAFT",
        createdAt: new Date("2026-03-01T10:00:00Z"),
        lineCount: 2,
        expectedTotalCents: 4_550,
        hasUnpricedLine: false,
      },
    ]);
  });

  it("tells when a line has no expected price and leaves it out of the total", async () => {
    const reader = new FakePurchaseOrderReader([order({ lines: [line(3, 1_250), line(5, null)] })]);

    const [summary] = await listPurchaseOrders(reader, { locationId: BRANCH });

    expect(summary).toMatchObject({ lineCount: 2, expectedTotalCents: 3_750, hasUnpricedLine: true });
  });

  it("lists the branch's orders only, most recent first, every state or the one asked for", async () => {
    const reader = new FakePurchaseOrderReader([
      order({ id: "old", createdAt: new Date("2026-03-01T10:00:00Z") }),
      order({ id: "new", state: "CANCELLED", createdAt: new Date("2026-03-05T10:00:00Z") }),
      order({ id: "other-branch", locationId: "branch-2" }),
    ]);

    expect(
      (await listPurchaseOrders(reader, { locationId: BRANCH })).map(({ id }) => id),
    ).toEqual(["new", "old"]);
    expect(
      (await listPurchaseOrders(reader, { locationId: BRANCH, state: "DRAFT" })).map(
        ({ id }) => id,
      ),
    ).toEqual(["old"]);
  });
});
