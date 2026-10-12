import { describe, expect, it } from "vitest";
import { countBody, countedMode, lotsMessage, lotsTotal } from "./stock-count-form";
import {
  ALMONDS_FIRST_LOT_ID,
  ALMONDS_SECOND_LOT_ID,
  almondsExpectedByLot,
} from "./test-support/stock-fixtures";

const { lots } = almondsExpectedByLot;
const AT = "2026-09-15T21:40:30.000Z";

describe("countedMode", () => {
  it("counts by lot when asked to and the product has lots to count", () => {
    expect(countedMode("lots", lots)).toBe("lots");
  });

  it("counts by product when the product has no lots to count", () => {
    expect(countedMode("lots", [])).toBe("product");
  });

  it("counts by product when asked to", () => {
    expect(countedMode("product", lots)).toBe("product");
  });
});

describe("countBody", () => {
  const values = { productId: "product-1", counted: "12,150", lots: {} };

  it("asks for the quantity counted of the product when counting by product", () => {
    expect(countBody({ ...values, mode: "product" }, { saleUnit: "KG", lots, at: AT })).toEqual({
      productId: "product-1",
      counted: 12_150,
      occurredAt: AT,
    });
  });

  it("asks for the quantity of every lot in the order given, a lot left empty counting as zero", () => {
    const body = countBody(
      {
        ...values,
        mode: "lots",
        lots: { [ALMONDS_FIRST_LOT_ID]: "4,300", [ALMONDS_SECOND_LOT_ID]: "  " },
      },
      { saleUnit: "KG", lots, at: AT },
    );

    expect(body).toEqual({
      productId: "product-1",
      lots: [
        { lotId: ALMONDS_FIRST_LOT_ID, counted: 4_300 },
        { lotId: ALMONDS_SECOND_LOT_ID, counted: 0 },
      ],
      occurredAt: AT,
    });
  });

  it("marks a lot quantity that cannot be read as not a number", () => {
    const body = countBody(
      { ...values, mode: "lots", lots: { [ALMONDS_FIRST_LOT_ID]: "mucho" } },
      { saleUnit: "KG", lots, at: AT },
    );

    expect(body.lots?.[0]?.counted).toBeNaN();
  });

  it("counts by product when the lots are not known, even if asked to count by lot", () => {
    expect(countBody({ ...values, mode: "lots" }, { saleUnit: "KG", lots: [], at: AT })).toEqual({
      productId: "product-1",
      counted: 12_150,
      occurredAt: AT,
    });
  });

  it("leaves the moment empty when it is not complete", () => {
    expect(
      countBody({ ...values, mode: "product" }, { saleUnit: "KG", lots, at: undefined }).occurredAt,
    ).toBe("");
  });
});

describe("lotsTotal", () => {
  it("adds the quantities typed, a lot left empty adding nothing", () => {
    expect(
      lotsTotal({ [ALMONDS_FIRST_LOT_ID]: "4,300", [ALMONDS_SECOND_LOT_ID]: "7,850" }, lots, "KG"),
    ).toBe(12_150);
    expect(lotsTotal({ [ALMONDS_FIRST_LOT_ID]: "4,300" }, lots, "KG")).toBe(4_300);
  });

  it("has no total while a quantity cannot be read", () => {
    expect(
      lotsTotal({ [ALMONDS_FIRST_LOT_ID]: "4,300", [ALMONDS_SECOND_LOT_ID]: "x" }, lots, "KG"),
    ).toBeUndefined();
  });
});

describe("lotsMessage", () => {
  it("explains how to write the quantity when one cannot be read", () => {
    expect(lotsMessage({ [ALMONDS_FIRST_LOT_ID]: "x" }, lots, "KG")).toBe(
      "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
    );
  });

  it("explains how to write the quantity when one is over the largest accepted quantity", () => {
    expect(lotsMessage({ [ALMONDS_FIRST_LOT_ID]: "9.999.999" }, lots, "KG")).toBe(
      "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
    );
  });

  it("says the lots changed when every quantity can be read", () => {
    expect(lotsMessage({ [ALMONDS_FIRST_LOT_ID]: "4,300" }, lots, "KG")).toBe(
      "Los lotes del producto cambiaron. Elegí el producto de nuevo.",
    );
  });
});
