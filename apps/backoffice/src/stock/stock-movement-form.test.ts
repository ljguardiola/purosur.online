import { describe, expect, it } from "vitest";
import { soleDirection } from "./stock-movement-form";
import { movementReasons } from "./test-support/stock-fixtures";

const { reasons } = movementReasons;

describe("soleDirection", () => {
  it("takes the only direction the chosen reason allows", () => {
    expect(soleDirection(reasons, "adjustment", "supplier_return")).toBe("subtract");
  });

  it("leaves the direction open for a reason that allows both", () => {
    expect(soleDirection(reasons, "adjustment", "purchase_correction")).toBeUndefined();
  });

  it("takes the direction every reason of the kind shares while no reason is chosen", () => {
    expect(soleDirection(reasons, "loss", null)).toBe("subtract");
  });

  it("leaves the direction open while no reason is chosen and the kind's reasons differ", () => {
    expect(soleDirection(reasons, "adjustment", null)).toBeUndefined();
  });

  it("leaves the direction open for a reason the cloud did not list", () => {
    expect(soleDirection([], "loss", "theft")).toBeUndefined();
  });
});
