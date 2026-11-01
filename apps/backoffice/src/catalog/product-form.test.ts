import { describe, expect, it } from "vitest";
import { EMPTY_PRODUCT_FORM } from "../platform/product-form";
import {
  CATALOG_PRODUCT_MESSAGES,
  catalogProductRequestFrom,
  EMPTY_CATALOG_PRODUCT_FORM,
  editedProductBarcodeProblemMessage,
  PRODUCT_EDIT_MESSAGES,
  productEditRequestFrom,
  productFormValues,
  reactivationBarcodeTakenError,
  saleUnitHeldByDiscountError,
  saleUnitHeldByPackagingError,
  saleUnitHeldBySupplierItemError,
} from "./product-form";

describe("PRODUCT_EDIT_MESSAGES", () => {
  it("lets an edited product keep its internal code beside others, still refusing a second one", () => {
    expect(
      PRODUCT_EDIT_MESSAGES.barcodes({
        ...EMPTY_PRODUCT_FORM,
        barcodes: { codes: ["2000000000015"], scan: "7790987000015" },
      }),
    ).toBe("Alguno de los códigos de barras no es válido.");
    expect(editedProductBarcodeProblemMessage(["2000000000015", "7790987000015"])).toBeUndefined();
    expect(editedProductBarcodeProblemMessage(["2000000000015", "2000000000022"])).toBe(
      "El producto puede tener un solo código interno.",
    );
  });
});

describe("the product's brand", () => {
  it("loads a product's brand, or none", () => {
    const product = {
      id: "product-1",
      name: "Miel",
      categoryId: "category-1",
      categoryName: "Almacén",
      saleUnit: "UNIT" as const,
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
      coverageDays: 15,
      active: true,
      labelCode: null,
      labelModules: null,
      version: 1,
    };
    expect(productFormValues({ ...product, brandId: "brand-1" }).brandId).toBe("brand-1");
    expect(productFormValues({ ...product, brandId: null }).brandId).toBe("");
  });
});

describe("saleUnitHeldByDiscountError", () => {
  it("names the discount that keeps the product sold by the unit", () => {
    expect(saleUnitHeldByDiscountError("3x2 Yerba")).toBe(
      'No se puede vender por peso mientras la promoción "3x2 Yerba" no esté desactivada o terminada.',
    );
  });
});

describe("saleUnitHeldByPackagingError", () => {
  it("names the active purchase packaging that keeps the sale unit", () => {
    expect(saleUnitHeldByPackagingError("Caja x 12")).toBe(
      'No se puede cambiar la unidad de venta mientras la presentación de compra "Caja x 12" esté activa.',
    );
  });
});

describe("saleUnitHeldBySupplierItemError", () => {
  it("says a linked supplier item keeps the sale unit", () => {
    expect(saleUnitHeldBySupplierItemError).toBe(
      "No se puede cambiar la unidad de venta mientras un ítem de proveedor esté vinculado al producto.",
    );
  });
});

describe("reactivationBarcodeTakenError", () => {
  it("names the one taken code and advises changing it or deactivating the product using it", () => {
    expect(reactivationBarcodeTakenError(["7790987000022"])).toBe(
      "El código 7790987000022 ya es de otro producto. Cambiá ese código en este producto o desactivá el producto que lo usa, y volvé a intentarlo.",
    );
  });

  it("names every taken code and advises in the plural", () => {
    expect(reactivationBarcodeTakenError(["7790987000022", "7790987000039"])).toBe(
      "Los códigos 7790987000022, 7790987000039 ya son de otro producto. Cambiá esos códigos en este producto o desactivá los productos que los usan, y volvé a intentarlo.",
    );
  });

  it("asks to review the product's codes when the cloud names none", () => {
    expect(reactivationBarcodeTakenError([])).toBe(
      "Alguno de los códigos ya es de otro producto. Revisá los códigos de este producto y volvé a intentarlo.",
    );
  });
});

describe("a product's coverage days in the form", () => {
  const product = {
    id: "product-1",
    name: "Miel",
    categoryId: "category-1",
    categoryName: "Almacén",
    brandId: null,
    saleUnit: "UNIT" as const,
    barcodes: ["111"],
    tagIds: [],
    netContent: null,
    active: true,
    labelCode: null,
    labelModules: null,
    version: 1,
  };

  it("starts a new product at 15 days", () => {
    expect(EMPTY_CATALOG_PRODUCT_FORM.coverageDays).toBe("15");
  });

  it("loads the days a product has", () => {
    expect(productFormValues({ ...product, coverageDays: 40 }).coverageDays).toBe("40");
  });

  it("sends the days typed as a number", () => {
    expect(
      catalogProductRequestFrom({ ...EMPTY_CATALOG_PRODUCT_FORM, coverageDays: " 30 " })
        .coverageDays,
    ).toBe(30);
    expect(
      productEditRequestFrom({
        ...productFormValues({ ...product, coverageDays: 40 }),
        coverageDays: "21",
      }),
    ).toMatchObject({ coverageDays: 21, version: 1 });
  });

  it.each(["", "abc", "1,5", "-3", "1.5"])("sends %j as not a number", (typed) => {
    expect(
      catalogProductRequestFrom({ ...EMPTY_CATALOG_PRODUCT_FORM, coverageDays: typed })
        .coverageDays,
    ).toBeNaN();
  });

  it.each(["", "0", "366", "1,5"])(
    "asks for a whole number of days from 1 to 365 for %j",
    (typed) => {
      expect(
        CATALOG_PRODUCT_MESSAGES.coverageDays({
          ...EMPTY_CATALOG_PRODUCT_FORM,
          coverageDays: typed,
        }),
      ).toBe("Ingresá un número entero de días, de 1 a 365.");
    },
  );

  it("asks to review the days when the typed number is valid", () => {
    expect(
      CATALOG_PRODUCT_MESSAGES.coverageDays({ ...EMPTY_CATALOG_PRODUCT_FORM, coverageDays: "30" }),
    ).toBe("Revisá los días de cobertura.");
  });
});
