import { describe, expect, expectTypeOf, it } from "vitest";
import { NET_CONTENT_QUANTITY_INVALID } from "./net-content-quantity";
import {
  brandMessage,
  EMPTY_PRODUCT_FORM,
  netContentMessage,
  type ProductFormValues,
  productMessage,
  productRequestFrom,
  saleUnitMessage,
  tagInactiveError,
  tagsMessage,
} from "./product-form";
import { sinTacc, vegano } from "./test-support/tags";

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

describe("saleUnitMessage", () => {
  it("does not accept a form without a chosen unit", () => {
    expectTypeOf<null>().not.toExtend<ProductFormValues["saleUnit"]>();
  });

  it("asks to review a chosen unit", () => {
    expect(saleUnitMessage()).toBe("Revisá la unidad de venta.");
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
  it("starts sold by the unit, with no category, no brand, and the net content in grams", () => {
    expect(EMPTY_PRODUCT_FORM).toEqual({
      name: "",
      categoryId: null,
      brandId: "",
      saleUnit: "UNIT",
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

  it("says a tag the cloud refuses no longer exists", () => {
    expect(tagsMessage()).toBe("Un distintivo elegido ya no existe.");
  });

  it("names the deactivated tag the cloud refuses, among the tags the form has", () => {
    expect(tagInactiveError([sinTacc, vegano], vegano.id)).toBe(
      '"Vegano" se dio de baja. Quitalo para guardar.',
    );
  });

  it("says a chosen tag was deactivated when the form does not know the refused one", () => {
    expect(tagInactiveError([sinTacc], vegano.id)).toBe(
      "Un distintivo elegido se dio de baja. Quitalo para guardar.",
    );
  });
});
