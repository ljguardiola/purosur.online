import { describe, expect, it } from "vitest";
import { packagingProductDescription } from "./packaging-product-description";

describe("packagingProductDescription", () => {
  it("names the packaging's product by its name, its brand and its net content", () => {
    expect(
      packagingProductDescription({
        productName: "Aceite de Almendras",
        brandName: "Vitora",
        netContent: { quantity: 30, unit: "ML" },
      }),
    ).toBe("Aceite de Almendras Vitora 30 ml");
  });

  it("names a product with neither brand nor net content by its name alone", () => {
    expect(
      packagingProductDescription({ productName: "Pan casero", brandName: null, netContent: null }),
    ).toBe("Pan casero");
  });
});
