import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_REASONS,
  adjustmentDirections,
  LOSS_REASONS,
  lossDelta,
  STOCK_DIRECTIONS,
  signedDelta,
} from "./stock-movement-reason.js";

describe("LOSS_REASONS", () => {
  it("lists the reasons a person picks for a loss, in the order they are offered", () => {
    expect(LOSS_REASONS).toEqual([
      "broken_or_spilled",
      "spoiled",
      "portioning_waste",
      "tasting_or_sample",
      "store_consumption",
      "theft",
    ]);
  });
});

describe("ADJUSTMENT_REASONS", () => {
  it("lists the reasons a person picks for an adjustment, in the order they are offered", () => {
    expect(ADJUSTMENT_REASONS).toEqual([
      "purchase_correction",
      "supplier_return",
      "batch_correction",
    ]);
  });
});

describe("STOCK_DIRECTIONS", () => {
  it("adds before it subtracts", () => {
    expect(STOCK_DIRECTIONS).toEqual(["add", "subtract"]);
  });
});

describe("adjustmentDirections", () => {
  it("lets stock returned to a supplier only subtract", () => {
    expect(adjustmentDirections("supplier_return")).toEqual(["subtract"]);
  });

  it.each(["purchase_correction", "batch_correction"] as const)(
    "lets a %s add or subtract",
    (reason) => {
      expect(adjustmentDirections(reason)).toEqual(["add", "subtract"]);
    },
  );
});

describe("signedDelta", () => {
  it("adds the quantity in the add direction", () => {
    expect(signedDelta("add", 12_000)).toBe(12_000);
  });

  it("subtracts the quantity in the subtract direction", () => {
    expect(signedDelta("subtract", 12_000)).toBe(-12_000);
  });
});

describe("lossDelta", () => {
  it("always subtracts the lost quantity", () => {
    expect(lossDelta(1200)).toBe(-1200);
  });
});
