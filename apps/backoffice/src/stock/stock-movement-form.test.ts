import { describe, expect, it } from "vitest";
import { productOptions, soleDirection } from "./stock-movement-form";
import {
  almonds,
  honey,
  movementReasons,
  oats,
  withoutBalance,
} from "./test-support/stock-fixtures";

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

describe("productOptions", () => {
  it("offers every product by name, marking a deactivated one", () => {
    expect(productOptions([oats, honey, almonds].map(withoutBalance))).toEqual([
      { value: almonds.id, label: almonds.name },
      { value: oats.id, label: oats.name, status: "Desactivado" },
      { value: honey.id, label: honey.name },
    ]);
  });

  it("offers nothing when there are no products", () => {
    expect(productOptions([])).toBeUndefined();
  });
});
