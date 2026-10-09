import { describe, expect, expectTypeOf, it } from "vitest";
import type { Capability } from "../../permissions/index.js";
import {
  MANUAL_STOCK_MOVEMENT_KINDS,
  manualStockMovementCapability,
  manualStockMovementReasons,
  STOCK_MOVEMENT_KINDS,
  type StockMovementKind,
  visibleManualStockMovementKinds,
} from "./stock-movement-kind.js";

describe("MANUAL_STOCK_MOVEMENT_KINDS", () => {
  it("lists the movements a person records by hand, losses before adjustments", () => {
    expect(MANUAL_STOCK_MOVEMENT_KINDS).toEqual(["loss", "adjustment"]);
  });
});

describe("STOCK_MOVEMENT_KINDS", () => {
  it("lists every movement a balance moves by: the ones recorded by hand, counts and sales", () => {
    expect(STOCK_MOVEMENT_KINDS).toEqual(["loss", "adjustment", "count", "sale"]);
    expectTypeOf<(typeof STOCK_MOVEMENT_KINDS)[number]>().toEqualTypeOf<StockMovementKind>();
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

describe("manualStockMovementReasons", () => {
  it("lets every loss reason only subtract, in the order they are offered", () => {
    expect(manualStockMovementReasons("loss")).toEqual([
      { kind: "loss", reason: "broken_or_spilled", directions: ["subtract"] },
      { kind: "loss", reason: "spoiled", directions: ["subtract"] },
      { kind: "loss", reason: "portioning_waste", directions: ["subtract"] },
      { kind: "loss", reason: "tasting_or_sample", directions: ["subtract"] },
      { kind: "loss", reason: "store_consumption", directions: ["subtract"] },
      { kind: "loss", reason: "theft", directions: ["subtract"] },
    ]);
  });

  it("lets each adjustment reason go in the directions it allows, in the order they are offered", () => {
    expect(manualStockMovementReasons("adjustment")).toEqual([
      { kind: "adjustment", reason: "purchase_correction", directions: ["add", "subtract"] },
      { kind: "adjustment", reason: "supplier_return", directions: ["subtract"] },
      { kind: "adjustment", reason: "batch_correction", directions: ["add", "subtract"] },
    ]);
  });
});
