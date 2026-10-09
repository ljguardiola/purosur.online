import { describe, expect, it } from "vitest";
import { type CompletedSaleLine, stockMovementsMatchLines } from "./completed-sale.js";

function line(id: string, productId: string, quantity: number): CompletedSaleLine {
  return {
    id,
    productId,
    productName: "Yerba mate 1 kg",
    quantity,
    listUnitPrice: 1500,
    priceListId: "price-list-1",
    promotionId: null,
    discountAmount: 0,
    lineTotal: 1500 * quantity,
  };
}

const LINES = [line("line-1", "product-yerba", 2), line("line-2", "product-sugar", 1)];
const YERBA_MOVEMENT = {
  id: "movement-1",
  saleLineId: "line-1",
  productId: "product-yerba",
  delta: -2000,
};
const SUGAR_MOVEMENT = {
  id: "movement-2",
  saleLineId: "line-2",
  productId: "product-sugar",
  delta: -1000,
};

describe("stockMovementsMatchLines", () => {
  it("holds for one movement per line naming it, its product and the stock it sold", () => {
    expect(stockMovementsMatchLines(LINES, [SUGAR_MOVEMENT, YERBA_MOVEMENT])).toBe(true);
  });

  it.each([
    ["a line has no movement", [YERBA_MOVEMENT]],
    ["no line has a movement", []],
    [
      "a movement names another product than its line's",
      [{ ...YERBA_MOVEMENT, productId: "product-sugar" }, SUGAR_MOVEMENT],
    ],
    [
      "a movement names a line of another sale",
      [{ ...YERBA_MOVEMENT, saleLineId: "line-9" }, SUGAR_MOVEMENT],
    ],
    [
      "a movement beside the lines' own names a line of another sale",
      [
        YERBA_MOVEMENT,
        SUGAR_MOVEMENT,
        { ...YERBA_MOVEMENT, id: "movement-3", saleLineId: "line-9" },
      ],
    ],
    [
      "a movement moves other stock than its line sold",
      [{ ...YERBA_MOVEMENT, delta: -7000 }, SUGAR_MOVEMENT],
    ],
    [
      "a line has two movements",
      [YERBA_MOVEMENT, { ...YERBA_MOVEMENT, id: "movement-3" }, SUGAR_MOVEMENT],
    ],
    [
      "two movements name one line and none the other",
      [YERBA_MOVEMENT, { ...YERBA_MOVEMENT, id: "movement-3" }],
    ],
  ])("fails when %s", (_case, movements) => {
    expect(stockMovementsMatchLines(LINES, movements)).toBe(false);
  });
});
