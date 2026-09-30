import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";
import type { LinePromotion } from "./sale.js";
import { addUnitToLine, newSaleLine, saleTotal } from "./sale-line.js";

const PRODUCT = { id: "product-1", name: "Yerba 1 kg" };
const PRICE = { priceListId: "list-1", unitPrice: 2500 };
const TEN_PERCENT: LinePromotion = { id: "ten", benefit: { kind: "PERCENT_OFF", percent: 10 } };
const THREE_FOR_TWO: LinePromotion = {
  id: "three-for-two",
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
};

describe("newSaleLine", () => {
  it("starts with one unit at the list price, frozen with its price list", () => {
    expect(newSaleLine("line-1", PRODUCT, PRICE, [])).toEqual({
      id: "line-1",
      productId: "product-1",
      productName: "Yerba 1 kg",
      quantity: 1,
      listUnitPrice: 2500,
      priceListId: "list-1",
      promotions: [],
      promotionId: null,
      discountAmount: 0,
      lineTotal: 2500,
    });
  });

  it("freezes the promotions it is given and applies the one giving the larger discount", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE, [TEN_PERCENT, THREE_FOR_TWO]);

    expect(line).toEqual(
      expect.objectContaining({
        promotions: [TEN_PERCENT, THREE_FOR_TWO],
        promotionId: "ten",
        discountAmount: 250,
        lineTotal: 2250,
      }),
    );
  });

  it("carries no promotion when the discount on one unit is nothing", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE, [THREE_FOR_TWO]);

    expect(line).toEqual(
      expect.objectContaining({
        promotions: [THREE_FOR_TWO],
        promotionId: null,
        discountAmount: 0,
        lineTotal: 2500,
      }),
    );
  });

  it("totals exactly the unit price for every price", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }), (unitPrice) => {
        const line = newSaleLine("line-1", PRODUCT, { priceListId: "list-1", unitPrice }, []);

        expect(line.lineTotal).toBe(unitPrice);
      }),
    );
  });
});

describe("addUnitToLine", () => {
  it("adds one unit and recomputes the total from the frozen price", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE, []);

    expect(addUnitToLine(line)).toEqual({ ...line, quantity: 2, lineTotal: 5000 });
  });

  it("picks the promotion again among the frozen ones: 10 % at 1 and 2 units, buy 3 pay 2 at 3", () => {
    const first = newSaleLine("line-1", PRODUCT, PRICE, [TEN_PERCENT, THREE_FOR_TWO]);
    const second = addUnitToLine(first);
    const third = addUnitToLine(second);

    expect([first, second, third].map((line) => line.promotionId)).toEqual([
      "ten",
      "ten",
      "three-for-two",
    ]);
    expect([first, second, third].map((line) => line.lineTotal)).toEqual([2250, 4500, 5000]);
    expect([first, second, third].map((line) => line.discountAmount)).toEqual([250, 500, 2500]);
  });

  it("keeps the frozen promotions whatever the quantity", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE, [TEN_PERCENT, THREE_FOR_TWO]);

    expect(addUnitToLine(addUnitToLine(line)).promotions).toEqual([TEN_PERCENT, THREE_FOR_TWO]);
  });

  it("starts a promotion on a line that had none once its quantity completes a group", () => {
    const line = addUnitToLine(
      addUnitToLine(newSaleLine("line-1", PRODUCT, PRICE, [THREE_FOR_TWO])),
    );

    expect(line).toEqual(
      expect.objectContaining({
        promotionId: "three-for-two",
        discountAmount: 2500,
        lineTotal: 5000,
      }),
    );
  });

  it("never changes the line's price, price list, product or id", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        fc.integer({ min: 1, max: 50 }),
        (unitPrice, additions) => {
          const first = newSaleLine("line-1", PRODUCT, { priceListId: "list-1", unitPrice }, []);
          let line = first;
          for (let index = 0; index < additions; index += 1) {
            line = addUnitToLine(line);
          }

          expect(line.quantity).toBe(1 + additions);
          expect(line.lineTotal).toBe((1 + additions) * unitPrice);
          expect({ ...line, quantity: 0, lineTotal: 0, discountAmount: 0 }).toEqual({
            ...first,
            quantity: 0,
            lineTotal: 0,
            discountAmount: 0,
          });
        },
      ),
    );
  });

  it("does not modify the line it was given", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE, []);

    addUnitToLine(line);

    expect(line.quantity).toBe(1);
    expect(line.lineTotal).toBe(2500);
  });
});

describe("saleTotal", () => {
  it("is zero for a sale without lines", () => {
    expect(saleTotal([])).toBe(0);
  });

  it("adds the totals of every line", () => {
    const yerba = addUnitToLine(newSaleLine("line-1", PRODUCT, PRICE, []));
    const sugar = newSaleLine(
      "line-2",
      { id: "product-2", name: "Azucar" },
      { priceListId: "list-1", unitPrice: 1200 },
      [],
    );

    expect(saleTotal([yerba, sugar])).toBe(6200);
  });

  it("is the sum of the line totals for any lines", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }), { maxLength: 30 }),
        (prices) => {
          const lines = prices.map((unitPrice, index) =>
            newSaleLine(
              `line-${index}`,
              { id: `product-${index}`, name: "P" },
              { priceListId: "list-1", unitPrice },
              [],
            ),
          );

          expect(saleTotal(lines)).toBe(prices.reduce((sum, price) => sum + price, 0));
        },
      ),
    );
  });
});
