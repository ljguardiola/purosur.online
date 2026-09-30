import type { CategorySummary } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { NET_CONTENT_QUANTITY_INVALID } from "./net-content-quantity";
import {
  barcodeListMessage,
  brandMessage,
  categoryMessage,
  categorySelectOptions,
  EMPTY_PRODUCT_FORM,
  netContentMessage,
  PRODUCT_TAG_INACTIVE_ERROR,
  productFormValues,
  productMessage,
  productRequestFrom,
  saleUnitMessage,
  tagsMessage,
} from "./product-form";

const NO_BARCODES = { codes: [], scan: "" };

describe("productMessage", () => {
  it("asks for a name when it is blank", () => {
    expect(productMessage({ ...EMPTY_PRODUCT_FORM, name: "  " })).toBe(
      "Ingresá el nombre del producto.",
    );
  });

  it("names the limit when the trimmed name is over it", () => {
    expect(productMessage({ ...EMPTY_PRODUCT_FORM, name: "a".repeat(101) })).toBe(
      "El nombre puede tener hasta 100 caracteres.",
    );
  });

  it("asks to review a name that passes every local check", () => {
    expect(productMessage({ ...EMPTY_PRODUCT_FORM, name: `  ${"a".repeat(100)}  ` })).toBe(
      "Revisá el nombre del producto.",
    );
  });
});

describe("categoryMessage", () => {
  it("asks to choose a category when none is chosen", () => {
    expect(categoryMessage({ ...EMPTY_PRODUCT_FORM, categoryId: null })).toBe(
      "Elegí una categoría.",
    );
  });

  it("asks to review a chosen category", () => {
    expect(categoryMessage({ ...EMPTY_PRODUCT_FORM, categoryId: "category-1" })).toBe(
      "Revisá la categoría.",
    );
  });
});

describe("saleUnitMessage", () => {
  it("asks to choose the unit when none is chosen", () => {
    expect(saleUnitMessage({ ...EMPTY_PRODUCT_FORM, saleUnit: null })).toBe(
      "Elegí la unidad de venta.",
    );
  });

  it("asks to review a chosen unit", () => {
    expect(saleUnitMessage({ ...EMPTY_PRODUCT_FORM, saleUnit: "KG" })).toBe(
      "Revisá la unidad de venta.",
    );
  });
});

describe("netContentMessage", () => {
  const withQuantity = (quantity: string) => ({
    ...EMPTY_PRODUCT_FORM,
    netContent: { quantity, unit: "G" as const },
  });

  it.each(["abc", "1.5", "0", "100.001", "1,2345"])(
    "states the accepted quantities for %s",
    (quantity) => {
      expect(netContentMessage(withQuantity(quantity))).toBe(NET_CONTENT_QUANTITY_INVALID);
    },
  );

  it.each(["", "500", "1,5", "100.000"])(
    "asks to review the net content when %j passes every local check",
    (quantity) => {
      expect(netContentMessage(withQuantity(quantity))).toBe("Revisá el contenido neto.");
    },
  );
});

describe("barcodeListMessage", () => {
  const withBarcodes = (codes: string[], scan = "") => ({
    ...EMPTY_PRODUCT_FORM,
    barcodes: { codes, scan },
  });

  it("asks for a code when there is neither a listed one nor one typed", () => {
    expect(barcodeListMessage(withBarcodes([], "  "))).toBe(
      "Escaneá al menos un código de barras.",
    );
  });

  it("names the problem of the listed codes together with the one typed", () => {
    expect(barcodeListMessage(withBarcodes(["779"], "779 0"))).toBe(
      "El código de barras no puede tener espacios.",
    );
    expect(barcodeListMessage(withBarcodes(["779"], "779"))).toBe(
      "Ese código ya está en la lista.",
    );
    expect(barcodeListMessage(withBarcodes([], "1".repeat(65)))).toBe(
      "El código de barras puede tener hasta 64 caracteres.",
    );
    expect(
      barcodeListMessage(
        withBarcodes(
          Array.from({ length: 20 }, (_, index) => `c${index}`),
          "x",
        ),
      ),
    ).toBe("El producto puede tener hasta 20 códigos de barras.");
  });

  it("says a list that passes every local check was refused by the cloud", () => {
    expect(barcodeListMessage(withBarcodes(["779"], "780"))).toBe(
      "Alguno de los códigos de barras no es válido.",
    );
  });
});

describe("productRequestFrom", () => {
  it("adds the code typed but not yet confirmed to the listed ones, trimmed", () => {
    const request = productRequestFrom({
      ...EMPTY_PRODUCT_FORM,
      barcodes: { codes: ["1"], scan: " 2 " },
    });

    expect(request.barcodes).toEqual(["1", "2"]);
  });

  it("sends no net content for a blank quantity", () => {
    expect(productRequestFrom(EMPTY_PRODUCT_FORM).netContent).toBeNull();
  });

  it("reads the quantity typed in Argentine format", () => {
    const request = productRequestFrom({
      ...EMPTY_PRODUCT_FORM,
      netContent: { quantity: "1.500,5", unit: "KG" },
    });

    expect(request.netContent).toEqual({ quantity: 1500.5, unit: "KG" });
  });

  it("sends a quantity that cannot be read as not a number, so the schema refuses it", () => {
    const request = productRequestFrom({
      ...EMPTY_PRODUCT_FORM,
      netContent: { quantity: "abc", unit: "G" },
    });

    expect(Number.isNaN(request.netContent?.quantity)).toBe(true);
  });

  it("sends an empty category id while none is chosen, so the schema refuses it", () => {
    expect(productRequestFrom(EMPTY_PRODUCT_FORM).categoryId).toBe("");
  });
});

describe("the empty form", () => {
  it("starts with nothing chosen, no brand, and the net content in grams", () => {
    expect(EMPTY_PRODUCT_FORM).toEqual({
      name: "",
      categoryId: null,
      brandId: "",
      saleUnit: null,
      netContent: { quantity: "", unit: "G" },
      barcodes: NO_BARCODES,
      tagIds: [],
    });
  });
});

describe("the product's brand", () => {
  it("asks for no brand when none is chosen, and for the chosen one otherwise", () => {
    expect(productRequestFrom({ ...EMPTY_PRODUCT_FORM, brandId: "" }).brandId).toBeNull();
    expect(productRequestFrom({ ...EMPTY_PRODUCT_FORM, brandId: "brand-1" }).brandId).toBe(
      "brand-1",
    );
  });

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
      active: true,
      version: 1,
    };
    expect(productFormValues({ ...product, brandId: "brand-1" }).brandId).toBe("brand-1");
    expect(productFormValues({ ...product, brandId: null }).brandId).toBe("");
  });

  it("says a brand the cloud refuses no longer exists", () => {
    expect(brandMessage()).toBe("La marca elegida ya no existe.");
  });
});

describe("the product's tags", () => {
  it("asks for the tags chosen, in order", () => {
    expect(
      productRequestFrom({ ...EMPTY_PRODUCT_FORM, tagIds: ["tag-2", "tag-1"] }).tagIds,
    ).toEqual(["tag-2", "tag-1"]);
  });

  it("says a tag the cloud refuses no longer exists, or was deactivated", () => {
    expect(tagsMessage()).toBe("Un distintivo elegido ya no existe.");
    expect(PRODUCT_TAG_INACTIVE_ERROR).toBe(
      "Un distintivo elegido se dio de baja. Quitalo para guardar.",
    );
  });
});

describe("categorySelectOptions", () => {
  it("only offers leaf categories, labeled by their full path", () => {
    const groceries: CategorySummary = {
      id: "category-1",
      name: "Almacén",
      version: 1,
      parentId: null,
    };
    const spreads: CategorySummary = {
      id: "category-3",
      name: "Untables",
      version: 1,
      parentId: "category-1",
    };

    expect(categorySelectOptions([groceries, spreads])).toEqual([
      { value: "category-3", label: "Almacén › Untables" },
    ]);
  });
});
