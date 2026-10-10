import { describe, expect, it } from "vitest";
import { movesBalance, receiptMovement } from "./stock-receipt.js";

const RECEIVED = {
  productId: "yerba",
  locationId: "branch-1",
  quantity: 24_000,
  occurredAt: new Date("2026-03-10T15:00:00Z"),
  actorId: "person-1",
  purchaseLineId: "purchase-line-1",
};

describe("receiptMovement", () => {
  it("adds the received quantity as a receipt without a reason, carrying its purchase line", () => {
    expect(receiptMovement(RECEIVED, null)).toEqual({
      productId: "yerba",
      locationId: "branch-1",
      kind: "receipt",
      reason: null,
      delta: 24_000,
      occurredAt: new Date("2026-03-10T15:00:00Z"),
      actorId: "person-1",
      purchaseLineId: "purchase-line-1",
      supersededByCountId: null,
    });
  });

  it("records the count that already covers the moment it was received", () => {
    expect(receiptMovement(RECEIVED, "count-1").supersededByCountId).toBe("count-1");
  });
});

describe("movesBalance", () => {
  it("moves the balance of a movement no count supersedes", () => {
    expect(movesBalance({ supersededByCountId: null })).toBe(true);
  });

  it("leaves the balance alone for a movement a count supersedes", () => {
    expect(movesBalance({ supersededByCountId: "count-1" })).toBe(false);
  });
});
