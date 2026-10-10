import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";
import { MAX_STOCK_QUANTITY, mayBeMovementQuantity, soldStockDelta } from "../../stock/index.js";
import type { LinePromotion } from "./sale.js";
import {
  addUnitToLine,
  mayBeSaleLineQuantity,
  newSaleLine,
  newWeighedSaleLine,
  saleTotal,
  saleUnitOfWeightSource,
  soldLineStockDelta,
  soldQuantity,
  withQuantity,
  withWeight,
} from "./sale-line.js";

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
      saleUnit: "UNIT",
      weightSource: null,
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

describe("withQuantity", () => {
  it("sets the quantity and recomputes the total from the frozen price", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE, []);

    expect(withQuantity(line, 4)).toEqual({ ...line, quantity: 4, lineTotal: 10000 });
  });

  it("picks the promotion again when the quantity goes down: buy 3 pay 2 at 3 units, 10 % at 2", () => {
    const three = withQuantity(
      newSaleLine("line-1", PRODUCT, PRICE, [TEN_PERCENT, THREE_FOR_TWO]),
      3,
    );
    const two = withQuantity(three, 2);

    expect(three).toEqual(
      expect.objectContaining({ promotionId: "three-for-two", lineTotal: 5000 }),
    );
    expect(two).toEqual(
      expect.objectContaining({ promotionId: "ten", discountAmount: 500, lineTotal: 4500 }),
    );
  });

  it("drops a promotion the smaller quantity no longer earns", () => {
    const three = withQuantity(newSaleLine("line-1", PRODUCT, PRICE, [THREE_FOR_TWO]), 3);

    expect(withQuantity(three, 2)).toEqual(
      expect.objectContaining({ promotionId: null, discountAmount: 0, lineTotal: 5000 }),
    );
  });

  it("does not modify the line it was given", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE, []);

    withQuantity(line, 7);

    expect(line.quantity).toBe(1);
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

describe("newWeighedSaleLine", () => {
  const QUESO = { id: "product-2", name: "Queso cremoso" };
  const PER_KILO = { priceListId: "list-1", unitPrice: 9000 };

  it("holds the weight in thousandths of a kilogram, priced per kilogram, with the source of the weight", () => {
    expect(newWeighedSaleLine("line-1", QUESO, PER_KILO, [], 1250, "MANUAL")).toEqual({
      id: "line-1",
      productId: "product-2",
      productName: "Queso cremoso",
      saleUnit: "KG",
      weightSource: "MANUAL",
      quantity: 1250,
      listUnitPrice: 9000,
      priceListId: "list-1",
      promotions: [],
      promotionId: null,
      discountAmount: 0,
      lineTotal: 11250,
    });
  });

  it("records the scale as the source when the weight came from it", () => {
    expect(newWeighedSaleLine("line-1", QUESO, PER_KILO, [], 1250, "SCALE").weightSource).toBe(
      "SCALE",
    );
  });

  it("rounds the amount to the cent, half up", () => {
    expect(newWeighedSaleLine("line-1", QUESO, PER_KILO, [], 1, "MANUAL").lineTotal).toBe(9);
    expect(
      newWeighedSaleLine("line-1", QUESO, { ...PER_KILO, unitPrice: 50 }, [], 10, "MANUAL")
        .lineTotal,
    ).toBe(1);
    expect(
      newWeighedSaleLine("line-1", QUESO, { ...PER_KILO, unitPrice: 49 }, [], 10, "MANUAL")
        .lineTotal,
    ).toBe(0);
  });

  it("applies the promotion giving the larger discount on the weight", () => {
    const line = newWeighedSaleLine(
      "line-1",
      QUESO,
      PER_KILO,
      [TEN_PERCENT, THREE_FOR_TWO],
      2000,
      "MANUAL",
    );

    expect(line).toEqual(
      expect.objectContaining({
        promotions: [TEN_PERCENT, THREE_FOR_TWO],
        promotionId: "ten",
        discountAmount: 1800,
        lineTotal: 16200,
      }),
    );
  });

  it("totals the price per kilogram applied to the weight for every price and weight", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        fc.integer({ min: 1, max: 100_000 }),
        (unitPrice, thousandths) => {
          const line = newWeighedSaleLine(
            "line-1",
            QUESO,
            { priceListId: "list-1", unitPrice },
            [],
            thousandths,
            "MANUAL",
          );

          expect(line.lineTotal).toBe(Math.floor((unitPrice * thousandths + 500) / 1000));
        },
      ),
    );
  });
});

describe("withWeight", () => {
  const WEIGHED = newWeighedSaleLine(
    "line-1",
    { id: "product-2", name: "Queso cremoso" },
    { priceListId: "list-1", unitPrice: 9000 },
    [TEN_PERCENT],
    1000,
    "SCALE",
  );

  it("sets the weight and its source and prices the new weight from the frozen price", () => {
    expect(withWeight(WEIGHED, 2500, "MANUAL")).toEqual({
      ...WEIGHED,
      quantity: 2500,
      weightSource: "MANUAL",
      promotionId: "ten",
      discountAmount: 2250,
      lineTotal: 20250,
    });
  });

  it("does not modify the line it was given", () => {
    withWeight(WEIGHED, 2500, "MANUAL");

    expect(WEIGHED.quantity).toBe(1000);
    expect(WEIGHED.weightSource).toBe("SCALE");
  });
});

describe("withQuantity on a weighed line", () => {
  it("keeps the line sold by the kilogram with the source of its weight", () => {
    const weighed = newWeighedSaleLine(
      "line-1",
      { id: "product-2", name: "Queso cremoso" },
      { priceListId: "list-1", unitPrice: 9000 },
      [],
      1000,
      "MANUAL",
    );

    expect(withQuantity(weighed, 500)).toEqual(
      expect.objectContaining({ saleUnit: "KG", weightSource: "MANUAL", lineTotal: 4500 }),
    );
  });
});

describe("soldQuantity", () => {
  it("is the units a line sold by the unit carries", () => {
    const line = withQuantity(newSaleLine("line-1", PRODUCT, PRICE, []), 4);

    expect(soldQuantity(line)).toEqual({ saleUnit: "UNIT", units: 4 });
  });

  it("is the thousandths of a kilogram a line sold by the kilogram carries", () => {
    expect(soldQuantity({ saleUnit: "KG", quantity: 1250 })).toEqual({
      saleUnit: "KG",
      thousandths: 1250,
    });
  });
});

describe("saleUnitOfWeightSource", () => {
  it("is the unit for a line recording no weight source", () => {
    expect(saleUnitOfWeightSource(null)).toBe("UNIT");
  });

  it.each(["SCALE", "MANUAL"] as const)("is the kilogram for a weight from %s", (source) => {
    expect(saleUnitOfWeightSource(source)).toBe("KG");
  });
});

describe("soldLineStockDelta", () => {
  it("takes a thousand thousandths out of stock per unit sold", () => {
    expect(soldLineStockDelta({ saleUnit: "UNIT", quantity: 3 })).toBe(-3000);
  });

  it("takes the weight in thousandths out of stock for a line sold by the kilogram", () => {
    expect(soldLineStockDelta({ saleUnit: "KG", quantity: 1250 })).toBe(-1250);
  });
});

describe("mayBeSaleLineQuantity", () => {
  it.each([1, 2_147_483])("accepts %s units", (quantity) => {
    expect(mayBeSaleLineQuantity(quantity, "UNIT")).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, 2_147_484, Number.MAX_SAFE_INTEGER + 1])(
    "refuses %s units",
    (quantity) => {
      expect(mayBeSaleLineQuantity(quantity, "UNIT")).toBe(false);
    },
  );

  it.each([1, 1250, MAX_STOCK_QUANTITY])("accepts a weight of %s thousandths", (weight) => {
    expect(mayBeSaleLineQuantity(weight, "KG")).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_STOCK_QUANTITY + 1])(
    "refuses a weight of %s thousandths",
    (weight) => {
      expect(mayBeSaleLineQuantity(weight, "KG")).toBe(false);
    },
  );

  it("accepts exactly the quantities whose sold stock a single movement may carry", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("UNIT" as const, "KG" as const),
        fc.integer({ min: -10, max: MAX_STOCK_QUANTITY }),
        (saleUnit, quantity) => {
          expect(mayBeSaleLineQuantity(quantity, saleUnit)).toBe(
            quantity > 0 &&
              mayBeMovementQuantity(-soldStockDelta(soldQuantity({ saleUnit, quantity }))),
          );
        },
      ),
    );
  });
});
