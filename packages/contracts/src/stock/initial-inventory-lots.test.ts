import { MAX_CASH_AMOUNT_CENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  initialInventoryLotListSchema,
  initialInventoryLotsQuerySchema,
  lotReferenceCostBodySchema,
} from "./initial-inventory-lots.js";

const LOT = {
  lotId: "11111111-1111-1111-1111-111111111111",
  productId: "22222222-2222-2222-2222-222222222222",
  productName: "Almendras peladas",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  expiresOn: "2027-02-01",
  counted: 2_500,
  costIncomplete: false,
  unitCostCents: 3_500,
  valueCents: 8_750,
};

describe("initialInventoryLotsQuerySchema", () => {
  it("accepts no filter at all", () => {
    expect(initialInventoryLotsQuerySchema.parse({})).toEqual({});
  });

  it.each(["known", "incomplete"])("accepts the %s cost filter", (cost) => {
    expect(initialInventoryLotsQuerySchema.parse({ cost })).toEqual({ cost });
  });

  it("accepts the text to find in the product's name", () => {
    expect(initialInventoryLotsQuerySchema.parse({ product: "yerba" })).toEqual({
      product: "yerba",
    });
  });

  it("reads a blank text as no filter", () => {
    expect(initialInventoryLotsQuerySchema.parse({ product: "  " })).toEqual({});
  });

  it("refuses a cost filter that is neither, naming the field", () => {
    const result = initialInventoryLotsQuerySchema.safeParse({ cost: "all" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["cost"]);
  });
});

describe("initialInventoryLotListSchema", () => {
  it("accepts the lots of the initial count with their cost and value", () => {
    expect(initialInventoryLotListSchema.parse({ lots: [LOT] })).toEqual({ lots: [LOT] });
  });

  it("accepts a lot whose cost is still incomplete, with no cost and no value", () => {
    const incomplete = { ...LOT, costIncomplete: true, unitCostCents: null, valueCents: null };

    expect(initialInventoryLotListSchema.parse({ lots: [incomplete] })).toEqual({
      lots: [incomplete],
    });
  });

  it("accepts a lot that never expires", () => {
    const lot = { ...LOT, expiresOn: null };

    expect(initialInventoryLotListSchema.parse({ lots: [lot] })).toEqual({ lots: [lot] });
  });

  it.each([
    ["a sale unit no product has", { saleUnit: "LITER" }],
    ["a fractional quantity", { counted: 0.5 }],
    ["an expiry that is no calendar day", { expiresOn: "2027-02-30" }],
  ])("refuses a lot with %s", (_case, override) => {
    expect(
      initialInventoryLotListSchema.safeParse({ lots: [{ ...LOT, ...override }] }).success,
    ).toBe(false);
  });
});

describe("lotReferenceCostBodySchema", () => {
  it("accepts a unit cost in whole cents", () => {
    expect(lotReferenceCostBodySchema.parse({ unitCostCents: 3_500 })).toEqual({
      unitCostCents: 3_500,
    });
  });

  it.each([
    ["zero", 0],
    ["a negative amount", -1],
    ["a fraction of a cent", 10.5],
    ["more than a cash amount can be", MAX_CASH_AMOUNT_CENTS + 1],
  ])("refuses %s, naming the field", (_case, unitCostCents) => {
    const result = lotReferenceCostBodySchema.safeParse({ unitCostCents });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["unitCostCents"]);
  });

  it("refuses a body with no cost", () => {
    expect(lotReferenceCostBodySchema.safeParse({}).success).toBe(false);
  });
});
