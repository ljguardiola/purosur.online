import { describe, expect, it } from "vitest";
import { arePurchasedLotsUntouched } from "./purchased-lot-move.js";
import { STOCK_MOVEMENT_KINDS } from "./stock-movement-kind.js";

const LINE = "line-1";

describe("arePurchasedLotsUntouched", () => {
  it("holds for lots nothing was ever allocated to", () => {
    expect(arePurchasedLotsUntouched(LINE, [])).toBe(true);
  });

  it("holds for the receipts of the line itself, the ones that correct its quantity included", () => {
    const receipts = [
      { kind: "receipt", purchaseLineId: LINE },
      { kind: "receipt", purchaseLineId: LINE },
    ] as const;

    expect(arePurchasedLotsUntouched(LINE, receipts)).toBe(true);
  });

  it("holds for the split of a lot, which moves units between the line's own lots", () => {
    expect(
      arePurchasedLotsUntouched(LINE, [
        { kind: "receipt", purchaseLineId: LINE },
        { kind: "lot_split", purchaseLineId: null },
      ]),
    ).toBe(true);
  });

  it.each(STOCK_MOVEMENT_KINDS.filter((kind) => kind !== "receipt" && kind !== "lot_split"))(
    "fails once a %s movement was allocated to a lot, even when the movements net to zero",
    (kind) => {
      expect(
        arePurchasedLotsUntouched(LINE, [
          { kind: "receipt", purchaseLineId: LINE },
          { kind, purchaseLineId: LINE },
        ]),
      ).toBe(false);
    },
  );

  it.each([null, "line-2"])("fails for a receipt of %j, which is not the line's", (other) => {
    expect(arePurchasedLotsUntouched(LINE, [{ kind: "receipt", purchaseLineId: other }])).toBe(
      false,
    );
  });
});
