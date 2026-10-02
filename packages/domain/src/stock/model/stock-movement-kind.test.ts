import { describe, expect, it } from "vitest";
import { MANUAL_STOCK_MOVEMENT_KINDS } from "./stock-movement-kind.js";

describe("MANUAL_STOCK_MOVEMENT_KINDS", () => {
  it("lists the movements a person records by hand, losses before adjustments", () => {
    expect(MANUAL_STOCK_MOVEMENT_KINDS).toEqual(["loss", "adjustment"]);
  });
});
