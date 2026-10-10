import { describe, expect, it } from "vitest";
import { lotOfPurchaseLine } from "./lot.js";

const LINE = {
  id: "purchase-line-1",
  productId: "yerba",
  locationId: "branch-1",
  quantity: 24_000,
  costPaidCents: 1_000_001,
  quantityPerPackage: 12_000,
  lotNumber: "L-2026-17",
  expiresOn: "2027-01-31",
};

describe("lotOfPurchaseLine", () => {
  it("copies the line's exact cost pair, lot number and expiry, and the quantity received", () => {
    expect(lotOfPurchaseLine(LINE)).toEqual({
      productId: "yerba",
      locationId: "branch-1",
      purchaseLineId: "purchase-line-1",
      quantityReceived: 24_000,
      costTotalCents: 1_000_001,
      costQuantity: 12_000,
      lotNumber: "L-2026-17",
      expiresOn: "2027-01-31",
    });
  });

  it("leaves the lot number and the expiry empty when the line has none", () => {
    expect(lotOfPurchaseLine({ ...LINE, lotNumber: null, expiresOn: null })).toMatchObject({
      lotNumber: null,
      expiresOn: null,
    });
  });
});
