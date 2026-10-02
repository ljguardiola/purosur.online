import { describe, expect, expectTypeOf, it } from "vitest";
import type { Capability } from "../../access/index.js";
import {
  MANUAL_STOCK_MOVEMENT_KINDS,
  manualStockMovementCapability,
  visibleManualStockMovementKinds,
} from "./stock-movement-kind.js";

describe("MANUAL_STOCK_MOVEMENT_KINDS", () => {
  it("lists the movements a person records by hand, losses before adjustments", () => {
    expect(MANUAL_STOCK_MOVEMENT_KINDS).toEqual(["loss", "adjustment"]);
  });
});

describe("manualStockMovementCapability", () => {
  it("pairs each kind of movement with its own capability", () => {
    expect(manualStockMovementCapability("loss")).toBe("stock_losses");
    expect(manualStockMovementCapability("adjustment")).toBe("stock_adjustments");
  });

  it("returns a capability", () => {
    expectTypeOf(manualStockMovementCapability).returns.toEqualTypeOf<Capability>();
  });
});

describe("visibleManualStockMovementKinds", () => {
  it("shows an Administrator every kind, losses before adjustments", () => {
    expect(visibleManualStockMovementKinds({ isAdministrator: true, permissionKeys: [] })).toEqual([
      "loss",
      "adjustment",
    ]);
  });

  it("shows only losses to a person who records losses", () => {
    expect(
      visibleManualStockMovementKinds({
        isAdministrator: false,
        permissionKeys: ["record_stock_losses", "view_stock_balances"],
      }),
    ).toEqual(["loss"]);
  });

  it("shows only adjustments to a person who adjusts stock", () => {
    expect(
      visibleManualStockMovementKinds({ isAdministrator: false, permissionKeys: ["adjust_stock"] }),
    ).toEqual(["adjustment"]);
  });

  it("shows both kinds, losses first, to a person who holds both permissions", () => {
    expect(
      visibleManualStockMovementKinds({
        isAdministrator: false,
        permissionKeys: ["adjust_stock", "record_stock_losses"],
      }),
    ).toEqual(["loss", "adjustment"]);
  });

  it("shows nothing to a person who holds neither permission", () => {
    expect(
      visibleManualStockMovementKinds({
        isAdministrator: false,
        permissionKeys: ["view_stock_balances"],
      }),
    ).toEqual([]);
  });
});
