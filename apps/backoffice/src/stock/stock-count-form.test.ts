import { describe, expect, it } from "vitest";
import { countBody, countedMode, lotsMessage, lotsTotal } from "./stock-count-form";
import { almondsExpectedByLot } from "./test-support/stock-fixtures";

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
      { ...values, mode: "lots", lots: { "lot-1": "4,300", "lot-2": "  " } },
      { saleUnit: "KG", lots, at: AT },
    );

    expect(body).toEqual({
      productId: "product-1",
      lots: [
        { lotId: "lot-1", counted: 4_300 },
        { lotId: "lot-2", counted: 0 },
      ],
      occurredAt: AT,
    });
  });

  it("marks a lot quantity that cannot be read as not a number", () => {
    const body = countBody(
      { ...values, mode: "lots", lots: { "lot-1": "mucho" } },
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
    expect(lotsTotal({ "lot-1": "4,300", "lot-2": "7,850" }, lots, "KG")).toBe(12_150);
    expect(lotsTotal({ "lot-1": "4,300" }, lots, "KG")).toBe(4_300);
  });

  it("has no total while a quantity cannot be read", () => {
    expect(lotsTotal({ "lot-1": "4,300", "lot-2": "x" }, lots, "KG")).toBeUndefined();
  });
});

describe("lotsMessage", () => {
  it("explains how to write the quantity when one cannot be read", () => {
    expect(lotsMessage({ "lot-1": "x" }, lots, "KG")).toBe(
      "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
    );
  });

  it("says the lots changed when every quantity can be read", () => {
    expect(lotsMessage({ "lot-1": "4,300" }, lots, "KG")).toBe(
      "Los lotes del producto cambiaron. Elegí el producto de nuevo.",
    );
  });
});
