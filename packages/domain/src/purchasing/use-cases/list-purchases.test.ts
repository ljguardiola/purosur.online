import { describe, expect, it } from "vitest";
import { findPurchaseListing, listPurchases } from "./list-purchases.js";
import type { PurchaseListing } from "./purchasing-list-reader.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const BRANCH = "branch-1";

const LINE = {
  id: "line-1",
  product: { id: "p-unit", name: "Yerba", saleUnit: "UNIT" as const },
  packaging: { id: "k-1", name: "Caja x 12" },
  packages: 2,
  quantity: 24_000,
  costPaidCents: 24_000,
  quantityPerPackage: 12_000,
  lotNumber: "L-77",
  expiresOn: "2027-03-01",
};

const PURCHASE: PurchaseListing & { locationId: string } = {
  id: "purchase-1",
  locationId: BRANCH,
  purchasedOn: "2026-10-01",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  receiptType: "factura_b",
  receiptNumber: "0001-00000042",
  note: null,
  recordedAt: new Date("2026-10-02T12:00:00.000Z"),
  lines: [LINE],
};

describe("listPurchases", () => {
  it("answers each line with its unit cost rounded half up to cents per sale unit", async () => {
    const thirds = { ...LINE, id: "line-2", costPaidCents: 1_000, quantityPerPackage: 3_000 };
    const reader = new FakePurchasingListReader({
      purchases: [{ ...PURCHASE, lines: [LINE, thirds] }],
    });

    const [purchase] = await listPurchases(reader, BRANCH);

    expect(purchase?.lines.map((line) => line.unitCostCents)).toEqual([2_000, 333]);
    expect(purchase?.lines[1]).toMatchObject({ costPaidCents: 1_000, quantityPerPackage: 3_000 });
  });

  it("answers only the purchases of the branch asked for", async () => {
    const elsewhere = { ...PURCHASE, id: "purchase-2", locationId: "branch-2" };
    const reader = new FakePurchasingListReader({ purchases: [elsewhere, PURCHASE] });

    const purchases = await listPurchases(reader, BRANCH);

    expect(purchases.map((purchase) => purchase.id)).toEqual(["purchase-1"]);
  });

  it("answers nothing when the branch has no purchases", async () => {
    expect(await listPurchases(new FakePurchasingListReader(), BRANCH)).toEqual([]);
  });
});

describe("findPurchaseListing", () => {
  it("answers the purchase with its lines' unit cost", async () => {
    const other = { ...PURCHASE, id: "purchase-2" };
    const reader = new FakePurchasingListReader({ purchases: [other, PURCHASE] });

    const purchase = await findPurchaseListing(reader, "purchase-1");

    expect(purchase?.id).toBe("purchase-1");
    expect(purchase?.lines[0]?.unitCostCents).toBe(2_000);
  });

  it("answers nothing for a purchase that does not exist", async () => {
    expect(await findPurchaseListing(new FakePurchasingListReader(), "missing")).toBeUndefined();
  });
});
