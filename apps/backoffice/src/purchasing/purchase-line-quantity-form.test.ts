import { purchaseLineQuantityCorrectionBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_PURCHASE_LINE_QUANTITY,
  PURCHASE_LINE_QUANTITY_FIELDS,
  purchaseLineQuantityLabel,
  purchaseLineQuantityMessages,
  purchaseLineQuantityRequestFrom,
  purchaseLineQuantityValuesOf,
} from "./purchase-line-quantity-form";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;
if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const loadedByPackages = lineDeMiel;
const loadedByQuantity = lineDeAvena;

describe("purchaseLineQuantityValuesOf", () => {
  it("starts from the packages of a line loaded by packages", () => {
    expect(purchaseLineQuantityValuesOf(loadedByPackages)).toEqual({ amount: "2" });
  });

  it("writes a thousand packages with the thousands separator the form reads back", () => {
    const line = { ...loadedByPackages, packages: 1_200, quantity: 14_400_000 };

    const values = purchaseLineQuantityValuesOf(line);

    expect(values).toEqual({ amount: "1.200" });
    expect(purchaseLineQuantityRequestFrom(values, line)).toEqual({
      loadedBy: "packages",
      packages: 1_200,
    });
  });

  it("starts from the kilos of a line loaded by quantity of a product sold by weight", () => {
    expect(purchaseLineQuantityValuesOf(loadedByQuantity)).toEqual({ amount: "12,500" });
  });

  it("starts from the units of a line loaded by quantity of a product sold by unit", () => {
    expect(
      purchaseLineQuantityValuesOf({ ...loadedByPackages, packages: null, quantity: 7_000 }),
    ).toEqual({ amount: "7" });
  });

  it("starts empty before any line is chosen", () => {
    expect(EMPTY_PURCHASE_LINE_QUANTITY).toEqual({ amount: "" });
  });
});

describe("purchaseLineQuantityRequestFrom", () => {
  it("sends the packages typed for a line loaded by packages", () => {
    const request = purchaseLineQuantityRequestFrom({ amount: "3" }, loadedByPackages);

    expect(request).toEqual({ loadedBy: "packages", packages: 3 });
    expect(purchaseLineQuantityCorrectionBodySchema.safeParse(request).success).toBe(true);
  });

  it.each([
    ["10,5", 10_500],
    ["0,250", 250],
    ["12", 12_000],
  ] as const)("sends %s kg of a line loaded by quantity as %i stock units", (amount, sent) => {
    const request = purchaseLineQuantityRequestFrom({ amount }, loadedByQuantity);

    expect(request).toEqual({ loadedBy: "quantity", quantity: sent });
    expect(purchaseLineQuantityCorrectionBodySchema.safeParse(request).success).toBe(true);
  });

  it("sends the units typed for a line loaded by quantity of a product sold by unit", () => {
    expect(
      purchaseLineQuantityRequestFrom(
        { amount: "7" },
        { ...loadedByPackages, packages: null, quantity: 7_000 },
      ),
    ).toEqual({ loadedBy: "quantity", quantity: 7_000 });
  });

  it.each(["", "abc", "0", "1,5"])("sends %j packages as a count the shape refuses", (amount) => {
    expect(
      purchaseLineQuantityCorrectionBodySchema.safeParse(
        purchaseLineQuantityRequestFrom({ amount }, loadedByPackages),
      ).success,
    ).toBe(false);
  });

  it.each(["", "abc", "0", "1,2345"])("sends %j kg as a quantity the shape refuses", (amount) => {
    expect(
      purchaseLineQuantityCorrectionBodySchema.safeParse(
        purchaseLineQuantityRequestFrom({ amount }, loadedByQuantity),
      ).success,
    ).toBe(false);
  });
});

describe("the quantity form's label, fields and messages", () => {
  it("asks for the packages of a line loaded by packages", () => {
    expect(purchaseLineQuantityLabel(loadedByPackages)).toBe("Cantidad de paquetes");
  });

  it("asks for the quantity of a line loaded by quantity", () => {
    expect(purchaseLineQuantityLabel(loadedByQuantity)).toBe("Cantidad");
  });

  it("lands both wire keys on the one field", () => {
    expect(PURCHASE_LINE_QUANTITY_FIELDS).toEqual({ packages: "amount", quantity: "amount" });
  });

  it("asks for a whole number of packages", () => {
    expect(purchaseLineQuantityMessages(loadedByPackages)).toEqual({
      amount: "Ingresá cuántos paquetes recibiste, en un número entero mayor a cero.",
    });
  });

  it("asks for whole units of a product sold by unit", () => {
    expect(
      purchaseLineQuantityMessages({ ...loadedByPackages, packages: null }).amount,
    ).toBe("Escribí una cantidad entera de unidades, por ejemplo 16.");
  });

  it("asks for kilos with up to 3 decimals of a product sold by weight", () => {
    expect(purchaseLineQuantityMessages(loadedByQuantity).amount).toBe(
      "Escribí los kilos con hasta 3 decimales, por ejemplo 12,150.",
    );
  });
});
