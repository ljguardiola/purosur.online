import { PACKAGING_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  packagingCreationRequestFrom,
  packagingEditRequestFrom,
  packagingFormValuesOf,
  packagingNameMessage,
  packagingProductOptions,
  packagingQuantityMessage,
} from "./packaging-form";
import { bolsaDeAvena, cajaDeMiel, packagableProducts } from "./test-support/packagings";

const values = { productId: null, name: "", quantity: "", version: 1 };

describe("packagingNameMessage", () => {
  it("asks for a name when it is blank or only spaces", () => {
    expect(packagingNameMessage({ ...values, name: " " })).toBe(
      "Ingresá el nombre de la presentación.",
    );
  });

  it("names the limit when the trimmed name is over it", () => {
    expect(
      packagingNameMessage({ ...values, name: "a".repeat(PACKAGING_NAME_MAX_LENGTH + 1) }),
    ).toBe(`El nombre puede tener hasta ${PACKAGING_NAME_MAX_LENGTH} caracteres.`);
  });

  it("asks to review a name that passes every local check", () => {
    expect(packagingNameMessage({ ...values, name: "Caja x 12" })).toBe(
      "Revisá el nombre de la presentación.",
    );
  });
});

describe("packagingQuantityMessage", () => {
  it("asks for the quantity when it is empty", () => {
    expect(packagingQuantityMessage(values, "UNIT")).toBe("Ingresá la cantidad por presentación.");
  });

  it("tells how to type the quantity in the product's sale unit", () => {
    expect(packagingQuantityMessage({ ...values, quantity: "x" }, "UNIT")).toBe(
      "Escribí una cantidad entera de unidades, por ejemplo 16.",
    );
    expect(packagingQuantityMessage({ ...values, quantity: "x" }, "KG")).toBe(
      "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
    );
  });
});

describe("packagingProductOptions", () => {
  it("offers the products by name, or none when there is none", () => {
    expect(
      packagingProductOptions([...packagableProducts].reverse())?.map((option) => option.label),
    ).toEqual(["Almendras peladas", "Avena arrollada", "Miel pura de abeja 1 kg"]);
    expect(packagingProductOptions([])).toBeUndefined();
  });
});

describe("packagingCreationRequestFrom", () => {
  it("sends the product, the trimmed name and the quantity typed in the product's unit as thousandths", () => {
    expect(
      packagingCreationRequestFrom(
        { productId: bolsaDeAvena.productId, name: " Bolsa de 25 kg ", quantity: "25", version: 1 },
        "KG",
      ),
    ).toEqual({
      productId: bolsaDeAvena.productId,
      name: "Bolsa de 25 kg",
      quantityPerPackage: 25_000,
    });
    expect(
      packagingCreationRequestFrom(
        { productId: cajaDeMiel.productId, name: "Caja", quantity: "12", version: 1 },
        "UNIT",
      ).quantityPerPackage,
    ).toBe(12_000);
  });

  it("sends an empty product and a quantity that cannot be read as not-a-number", () => {
    const request = packagingCreationRequestFrom(values, "UNIT");
    expect(request.productId).toBe("");
    expect(request.quantityPerPackage).toBeNaN();
  });
});

describe("packagingEditRequestFrom", () => {
  it("sends the trimmed name, the quantity in thousandths and the version it was loaded at", () => {
    expect(
      packagingEditRequestFrom(
        { productId: bolsaDeAvena.productId, name: " Bolsa ", quantity: "2,5", version: 4 },
        "KG",
      ),
    ).toEqual({ name: "Bolsa", quantityPerPackage: 2500, version: 4 });
  });
});

describe("packagingFormValuesOf", () => {
  it("fills the form with the packaging's quantity written in the sale unit it is stated in", () => {
    expect(packagingFormValuesOf(bolsaDeAvena)).toEqual({
      productId: bolsaDeAvena.productId,
      name: "Bolsa de 25 kg",
      quantity: "25,000",
      version: 2,
    });
    expect(packagingFormValuesOf(cajaDeMiel).quantity).toBe("12");
  });

  it("leaves the quantity empty when it is stated in a sale unit its product no longer has", () => {
    expect(packagingFormValuesOf({ ...bolsaDeAvena, saleUnitChanged: true })).toEqual({
      productId: bolsaDeAvena.productId,
      name: "Bolsa de 25 kg",
      quantity: "",
      version: 2,
    });
  });
});
