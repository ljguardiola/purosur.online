import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "../../pricing/index.js";
import { addUnitToLine, newSaleLine } from "./sale-line.js";

const PRODUCT = { id: "product-1", name: "Yerba 1 kg" };
const PRICE = { priceListId: "list-1", unitPrice: 2500 };

describe("newSaleLine", () => {
  it("starts with one unit at the list price, frozen with its price list", () => {
    expect(newSaleLine("line-1", PRODUCT, PRICE)).toEqual({
      id: "line-1",
      productId: "product-1",
      productName: "Yerba 1 kg",
      quantity: 1,
      listUnitPrice: 2500,
      priceListId: "list-1",
      lineTotal: 2500,
    });
  });

  it("totals exactly the unit price for every price", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }), (unitPrice) => {
        const line = newSaleLine("line-1", PRODUCT, { priceListId: "list-1", unitPrice });

        expect(line.lineTotal).toBe(unitPrice);
      }),
    );
  });
});

describe("addUnitToLine", () => {
  it("adds one unit and recomputes the total from the frozen price", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE);

    expect(addUnitToLine(line)).toEqual({ ...line, quantity: 2, lineTotal: 5000 });
  });

  it("never changes the line's price, price list, product or id", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UNIT_PRICE_CENTS }),
        fc.integer({ min: 1, max: 50 }),
        (unitPrice, additions) => {
          const first = newSaleLine("line-1", PRODUCT, { priceListId: "list-1", unitPrice });
          let line = first;
          for (let index = 0; index < additions; index += 1) {
            line = addUnitToLine(line);
          }

          expect(line.quantity).toBe(1 + additions);
          expect(line.lineTotal).toBe((1 + additions) * unitPrice);
          expect({ ...line, quantity: 0, lineTotal: 0 }).toEqual({
            ...first,
            quantity: 0,
            lineTotal: 0,
          });
        },
      ),
    );
  });

  it("does not modify the line it was given", () => {
    const line = newSaleLine("line-1", PRODUCT, PRICE);

    addUnitToLine(line);

    expect(line.quantity).toBe(1);
    expect(line.lineTotal).toBe(2500);
  });
});
