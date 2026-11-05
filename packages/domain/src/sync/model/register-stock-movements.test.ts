import { describe, expect, expectTypeOf, it } from "vitest";
import { STOCK_MOVEMENT_KINDS, type StockMovementKind } from "../../stock/index.js";
import {
  REGISTER_STOCK_MOVEMENT_KINDS,
  stockMovementReachesRegisters,
} from "./register-stock-movements.js";

describe("the stock movements that reach registers", () => {
  it("is every kind but the split of a lot, which is the cloud's own bookkeeping", () => {
    expect(REGISTER_STOCK_MOVEMENT_KINDS).toEqual(
      STOCK_MOVEMENT_KINDS.filter((kind) => kind !== "lot_split"),
    );
    expectTypeOf<
      Exclude<StockMovementKind, (typeof REGISTER_STOCK_MOVEMENT_KINDS)[number]>
    >().toEqualTypeOf<"lot_split">();
  });

  it.each(STOCK_MOVEMENT_KINDS.filter((kind) => kind !== "lot_split"))(
    "reaches registers when it is a %s",
    (kind) => {
      expect(stockMovementReachesRegisters(kind)).toBe(true);
    },
  );

  it("does not reach registers when it is the split of a lot", () => {
    expect(stockMovementReachesRegisters("lot_split")).toBe(false);
  });
});
