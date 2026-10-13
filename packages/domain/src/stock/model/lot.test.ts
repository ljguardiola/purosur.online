import { describe, expect, it } from "vitest";
import { lotOfOpeningCount, lotOfPurchaseLine } from "./lot.js";

const LINE = {
  id: "purchase-line-1",
  productId: "yerba",
  locationId: "branch-1",
  quantity: 24_000,
  costPaidCents: 1_000_001,
  quantityPerPackage: 12_000,
  lotNumber: "L-2026-17",
  expiresOn: "2027-01-31",
  purchasedOn: "2026-03-09",
};

describe("lotOfPurchaseLine", () => {
  it("copies the line's exact cost pair, lot number, expiry and purchase date, and the quantity received", () => {
    expect(lotOfPurchaseLine(LINE)).toEqual({
      productId: "yerba",
      locationId: "branch-1",
      purchaseLineId: "purchase-line-1",
      quantityReceived: 24_000,
      costTotalCents: 1_000_001,
      costQuantity: 12_000,
      lotNumber: "L-2026-17",
      expiresOn: "2027-01-31",
      purchasedOn: "2026-03-09",
    });
  });

  it("leaves the lot number and the expiry empty when the line has none", () => {
    expect(lotOfPurchaseLine({ ...LINE, lotNumber: null, expiresOn: null })).toMatchObject({
      lotNumber: null,
      expiresOn: null,
    });
  });
});

describe("lotOfOpeningCount", () => {
  const COUNT = {
    movementId: "movement-1",
    productId: "yerba",
    locationId: "branch-1",
    counted: 6_000,
    expiresOn: "2027-01-31",
  };

  it("makes a lot of the counted quantity that remembers the movement that counted it and its expiry", () => {
    expect(lotOfOpeningCount(COUNT)).toEqual({
      productId: "yerba",
      locationId: "branch-1",
      originMovementId: "movement-1",
      quantityReceived: 6_000,
      expiresOn: "2027-01-31",
    });
  });

  it("leaves the expiry empty when the product counted has none", () => {
    expect(lotOfOpeningCount({ ...COUNT, expiresOn: null })).toMatchObject({ expiresOn: null });
  });
});
