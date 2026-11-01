import { describe, expect, test } from "vitest";
import {
  emptyOrderLine,
  nextOrderLineId,
  PURCHASE_ORDER_FIELDS,
  purchaseOrderEditRequestFrom,
  purchaseOrderFormValuesOf,
  purchaseOrderLinesMessage,
} from "./purchase-order-form";
import { DRAFT_ORDER } from "./test-support/purchase-orders";
import { AVENA_PRODUCT_ID, MIEL_PRODUCT_ID } from "./test-support/purchase-products";

describe("purchaseOrderFormValuesOf", () => {
  test("types each line's packages and quantity each holds as the person reads them", () => {
    expect(purchaseOrderFormValuesOf(DRAFT_ORDER).lines).toEqual([
      {
        id: 1,
        fromOrder: true,
        productId: MIEL_PRODUCT_ID,
        saleUnit: "UNIT",
        packages: "3",
        quantityPerPackage: "12",
      },
      {
        id: 2,
        fromOrder: true,
        productId: AVENA_PRODUCT_ID,
        saleUnit: "KG",
        packages: "2",
        quantityPerPackage: "25,000",
      },
    ]);
  });
});

describe("purchaseOrderEditRequestFrom", () => {
  test("round-trips the lines of an order without changing them", () => {
    expect(purchaseOrderEditRequestFrom(purchaseOrderFormValuesOf(DRAFT_ORDER))).toEqual({
      lines: [
        { productId: MIEL_PRODUCT_ID, packages: 3, quantityPerPackage: 12_000 },
        { productId: AVENA_PRODUCT_ID, packages: 2, quantityPerPackage: 25_000 },
      ],
    });
  });

  test("reads what was typed with the sale unit of each line", () => {
    const request = purchaseOrderEditRequestFrom({
      lines: [
        {
          id: 1,
          fromOrder: true,
          productId: AVENA_PRODUCT_ID,
          saleUnit: "KG",
          packages: "4",
          quantityPerPackage: "12,5",
        },
      ],
    });

    expect(request.lines).toEqual([
      { productId: AVENA_PRODUCT_ID, packages: 4, quantityPerPackage: 12_500 },
    ]);
  });

  test("sends text that is no number as not a number, and no product as an empty id", () => {
    const request = purchaseOrderEditRequestFrom({
      lines: [{ ...emptyOrderLine(1), packages: "abc", quantityPerPackage: "" }],
    });

    expect(request.lines).toEqual([
      { productId: "", packages: Number.NaN, quantityPerPackage: Number.NaN },
    ]);
  });
});

describe("emptyOrderLine and nextOrderLineId", () => {
  test("an empty line is a new one, with no product and nothing typed", () => {
    expect(emptyOrderLine(7)).toEqual({
      id: 7,
      fromOrder: false,
      productId: null,
      saleUnit: "UNIT",
      packages: "",
      quantityPerPackage: "",
    });
  });

  test("the next id follows the highest one", () => {
    expect(nextOrderLineId([])).toBe(1);
    expect(nextOrderLineId([emptyOrderLine(2), emptyOrderLine(5)])).toBe(6);
  });
});

describe("PURCHASE_ORDER_FIELDS", () => {
  test("lands every refusal of the lines on the lines field", () => {
    expect(PURCHASE_ORDER_FIELDS).toEqual({
      lines: "lines",
      productId: "lines",
      packages: "lines",
      quantityPerPackage: "lines",
    });
  });
});

describe("purchaseOrderLinesMessage", () => {
  const valid = purchaseOrderFormValuesOf(DRAFT_ORDER).lines;

  test("asks for a line when there is none", () => {
    expect(purchaseOrderLinesMessage({ lines: [] })).toBe("Agregá al menos una línea.");
  });

  test("names the first line without a product", () => {
    expect(
      purchaseOrderLinesMessage({ lines: [...valid, { ...emptyOrderLine(3), packages: "1" }] }),
    ).toBe("Línea 3: Elegí el producto.");
  });

  test("names the first line whose packages are not a whole number", () => {
    expect(
      purchaseOrderLinesMessage({
        lines: valid.map((line, index) => (index === 1 ? { ...line, packages: "1,5" } : line)),
      }),
    ).toBe("Línea 2: Ingresá cuántos paquetes pedir, en un número entero.");
  });

  test("tells how to type the quantity each package holds, by the line's sale unit", () => {
    expect(
      purchaseOrderLinesMessage({
        lines: valid.map((line, index) =>
          index === 1 ? { ...line, quantityPerPackage: "" } : line,
        ),
      }),
    ).toBe("Línea 2: Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.");
    expect(
      purchaseOrderLinesMessage({
        lines: valid.map((line, index) =>
          index === 0 ? { ...line, quantityPerPackage: "" } : line,
        ),
      }),
    ).toBe("Línea 1: Escribí una cantidad entera de unidades, por ejemplo 16.");
  });

  test("asks to review the quantities when the lines read well but the cloud refused them", () => {
    expect(purchaseOrderLinesMessage({ lines: valid })).toBe(
      "Revisá los paquetes y la cantidad por paquete de las líneas.",
    );
  });
});
