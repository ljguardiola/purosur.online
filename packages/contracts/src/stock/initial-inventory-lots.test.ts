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
  brandName: "Vitora",
  netContent: { quantity: 250, unit: "G" },
  categoryName: "Frutos secos",
  saleUnit: "KG",
  expiresOn: "2027-02-01",
  counted: 2_500,
  withdrawn: false,
  remaining: 2_500,
  costIncomplete: false,
  unitCostCents: 3_500,
  valueCents: 8_750,
  supplierPrices: [],
};

const SUPPLIER_PRICE = {
  supplierItemId: "33333333-3333-4333-8333-333333333333",
  supplierName: "Distribuidora Sur",
  packagingName: "Caja x 10",
  listDate: "2026-03-01",
  unitCostCents: 3_500,
  cheapest: true,
  current: false,
};

describe("initialInventoryLotsQuerySchema", () => {
  it("accepts no filter at all", () => {
    expect(initialInventoryLotsQuerySchema.parse({})).toStrictEqual({});
  });

  it.each(["known", "incomplete"])("accepts the %s cost filter", (cost) => {
    expect(initialInventoryLotsQuerySchema.parse({ cost })).toStrictEqual({ cost });
  });

  it("accepts the text to find in the product's name", () => {
    expect(initialInventoryLotsQuerySchema.parse({ product: "yerba" })).toStrictEqual({
      product: "yerba",
    });
  });

  it("reads a blank text as no filter", () => {
    expect(initialInventoryLotsQuerySchema.parse({ product: "  " })).toStrictEqual({});
  });

  it("refuses a cost filter that is neither, naming the field", () => {
    const result = initialInventoryLotsQuerySchema.safeParse({ cost: "all" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["cost"],
      message: "cost must be known or incomplete",
    });
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

  it("accepts the lot of a withdrawn line with what it still holds", () => {
    const withdrawn = { ...LOT, withdrawn: true, remaining: 1_000 };

    expect(initialInventoryLotListSchema.parse({ lots: [withdrawn] })).toEqual({
      lots: [withdrawn],
    });
  });

  it("accepts the loaded supplier prices of the lot's product", () => {
    const lot = {
      ...LOT,
      supplierPrices: [SUPPLIER_PRICE, { ...SUPPLIER_PRICE, cheapest: false }],
    };

    expect(initialInventoryLotListSchema.parse({ lots: [lot] })).toEqual({ lots: [lot] });
  });

  it.each([
    ["no brand name", { brandName: undefined }],
    ["no net content", { netContent: undefined }],
  ])("refuses a lot with %s", (_case, override) => {
    expect(initialInventoryLotListSchema.safeParse({ lots: [{ ...LOT, ...override }] }).success).toBe(
      false,
    );
  });

  it.each([
    ["no supplier prices field", { supplierPrices: undefined }],
    ["a fractional unit cost", { unitCostCents: 3_500.5 }],
    ["a list date that is no calendar day", { listDate: "2026-02-30" }],
    ["no cheapest mark", { cheapest: undefined }],
    ["no current mark", { current: undefined }],
    ["no supplier name", { supplierName: undefined }],
    ["no packaging name", { packagingName: undefined }],
    ["no supplier item", { supplierItemId: undefined }],
  ])("refuses a lot with %s", (_case, override) => {
    const supplierPrices =
      "supplierPrices" in override ? undefined : [{ ...SUPPLIER_PRICE, ...override }];

    expect(
      initialInventoryLotListSchema.safeParse({ lots: [{ ...LOT, supplierPrices }] }).success,
    ).toBe(false);
  });

  it("accepts a lot that never expires", () => {
    const lot = { ...LOT, expiresOn: null };

    expect(initialInventoryLotListSchema.parse({ lots: [lot] })).toEqual({ lots: [lot] });
  });

  it.each([
    ["a sale unit no product has", { saleUnit: "LITER" }],
    ["a fractional quantity", { counted: 0.5 }],
    ["a fractional remaining quantity", { remaining: 0.5 }],
    ["a withdrawn mark that is no boolean", { withdrawn: "yes" }],
    ["no withdrawn mark", { withdrawn: undefined }],
    ["no remaining quantity", { remaining: undefined }],
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
    expect(result.error?.issues[0]).toMatchObject({
      path: ["unitCostCents"],
      message: "unitCostCents must be a positive whole number of cents",
    });
  });

  it.each([
    ["not a number", "abc"],
    ["not a number at all", Number.NaN],
    ["missing", undefined],
  ])("names the cost field when the cost is %s", (_case, unitCostCents) => {
    const result = lotReferenceCostBodySchema.safeParse({ unitCostCents });

    expect(result.error?.issues[0]).toMatchObject({
      path: ["unitCostCents"],
      message: "unitCostCents must be a positive whole number of cents",
    });
  });

  it("declares in its metadata the largest cost it accepts", () => {
    const [typedBody] = lotReferenceCostBodySchema.options;
    const unitCostCents = typedBody.shape.unitCostCents;

    expect(unitCostCents.meta()).toMatchObject({ maxValue: MAX_CASH_AMOUNT_CENTS });
  });

  it("accepts the id of a supplier item whose loaded price is chosen as the cost", () => {
    const supplierItemId = "33333333-3333-4333-8333-333333333333";

    expect(lotReferenceCostBodySchema.parse({ supplierItemId })).toEqual({ supplierItemId });
  });

  it.each([
    ["no id", ""],
    ["something that is no id", "not-an-id"],
    ["a number", 5],
    ["nothing", null],
  ])(
    "refuses a supplier item given as %s on its own field, saying it must be a supplier item's id",
    (_case, supplierItemId) => {
      const result = lotReferenceCostBodySchema.safeParse({ supplierItemId });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: ["supplierItemId"],
          message: "supplierItemId must be a supplier item's id",
        }),
      ]);
    },
  );

  it("reads a body naming a supplier item as that price's choice, whatever cost it also carries", () => {
    const supplierItemId = "33333333-3333-4333-8333-333333333333";

    expect(lotReferenceCostBodySchema.parse({ unitCostCents: 3_500, supplierItemId })).toEqual({
      supplierItemId,
    });
  });

  it.each([
    ["nothing", null],
    ["a number", 5],
    ["a text", "x"],
  ])("refuses a body that is %s, saying a supplier item's id is expected", (_case, body) => {
    const result = lotReferenceCostBodySchema.safeParse(body);

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: [], message: "supplierItemId must be a supplier item's id" }),
    ]);
  });

  it("refuses a body with no cost or a cost that is no number, with the same message", () => {
    for (const body of [{}, { unitCostCents: "35" }]) {
      const result = lotReferenceCostBodySchema.safeParse(body);

      expect(result.error?.issues[0]?.message).toBe(
        "unitCostCents must be a positive whole number of cents",
      );
    }
  });
});
