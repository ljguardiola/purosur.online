import { supplierPriceListRowLinkBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_SUPPLIER_ITEM_LINK_FORM,
  linkProductOptions,
  proposedProductIdOf,
  SUPPLIER_ITEM_LINK_FIELD_MESSAGES,
  SUPPLIER_ITEM_LINK_FIELDS,
  supplierItemLinkFormValuesOf,
  supplierItemLinkRequestFrom,
  vatRateOptionsOf,
  vatRateOrDefault,
} from "./supplier-item-link-form";
import {
  GRANOLA_LINK_CHOICES,
  LINK_CHOICES,
  NO_PROPOSAL,
  PASAS_ID,
  PROPOSED_BY_AI,
  UNAVAILABLE_PROPOSAL,
} from "./test-support/supplier-item-links";
import { ALMOND_LINK } from "./test-support/supplier-price-lists";

const filled = {
  ...EMPTY_SUPPLIER_ITEM_LINK_FORM,
  productId: PASAS_ID,
  saleUnit: "KG" as const,
  quantity: "10",
  quantityUnit: "KG" as const,
  vatRate: "2100",
  version: 3,
};

describe("supplierItemLinkRequestFrom", () => {
  it("sends the chosen VAT rate in basis points when the cloud says the link needs one", () => {
    expect(supplierItemLinkRequestFrom({ ...filled, vatRate: "1050" }, true)).toEqual({
      version: 3,
      productId: PASAS_ID,
      quantity: 10_000,
      vatRate: 1_050,
    });
  });

  it("sends the quantity in grams as thousandths of a kilo when grams are chosen", () => {
    expect(
      supplierItemLinkRequestFrom({ ...filled, quantity: "500", quantityUnit: "G" }, false)
        .quantity,
    ).toBe(500);
  });

  it("sends the quantity in units of a product sold by the unit", () => {
    expect(
      supplierItemLinkRequestFrom({ ...filled, saleUnit: "UNIT", quantity: "12" }, false).quantity,
    ).toBe(12_000);
  });

  it("sends a quantity the shape refuses when it is not readable", () => {
    const request = supplierItemLinkRequestFrom({ ...filled, quantity: "diez" }, false);

    expect(supplierPriceListRowLinkBodySchema.safeParse(request).success).toBe(false);
  });

  it("sends a rate the shape refuses when none is chosen for a link that needs one", () => {
    const request = supplierItemLinkRequestFrom({ ...filled, vatRate: "" }, true);

    expect(supplierPriceListRowLinkBodySchema.safeParse(request).success).toBe(false);
  });

  it("sends no rate when the cloud says the link needs none", () => {
    expect(supplierItemLinkRequestFrom({ ...filled, vatRate: "1050" }, false).vatRate).toBeNull();
  });

  it("sends an empty id for what is not chosen, so the shape refuses it", () => {
    const request = supplierItemLinkRequestFrom(EMPTY_SUPPLIER_ITEM_LINK_FORM, false);

    expect(supplierPriceListRowLinkBodySchema.safeParse(request).success).toBe(false);
    expect(request).toMatchObject({ productId: "" });
  });

  it("builds a request the shape accepts", () => {
    expect(
      supplierPriceListRowLinkBodySchema.safeParse(supplierItemLinkRequestFrom(filled, true))
        .success,
    ).toBe(true);
  });
});

describe("the fields", () => {
  it("lands each problem of the request on the field that holds it", () => {
    expect(SUPPLIER_ITEM_LINK_FIELDS).toEqual({
      productId: "productId",
      saleUnit: null,
      quantity: "quantity",
      quantityUnit: null,
      vatRate: "vatRate",
      version: null,
    });
  });

  it("tells what to choose for each field", () => {
    expect(SUPPLIER_ITEM_LINK_FIELD_MESSAGES.productId).toBe("Elegí el producto del catálogo.");
    expect(SUPPLIER_ITEM_LINK_FIELD_MESSAGES.vatRate).toBe("Elegí el IVA del ítem.");
    expect(SUPPLIER_ITEM_LINK_FIELD_MESSAGES.quantity({ ...filled, quantity: "" })).toBe(
      "Ingresá la cantidad que trae el ítem.",
    );
  });
});

describe("supplierItemLinkFormValuesOf", () => {
  it("starts empty, with the loaded version and no VAT rate chosen, for an item not linked", () => {
    expect(supplierItemLinkFormValuesOf(null, 3)).toEqual({
      productId: null,
      saleUnit: "UNIT",
      quantity: "",
      quantityUnit: "KG",
      vatRate: "",
      version: 3,
    });
  });

  it("starts with the product, the quantity and the rate an item is linked with", () => {
    expect(supplierItemLinkFormValuesOf({ ...ALMOND_LINK, vatRate: 1_050 }, 3)).toEqual({
      productId: ALMOND_LINK.product.id,
      saleUnit: "KG",
      quantity: "25",
      quantityUnit: "KG",
      vatRate: "1050",
      version: 3,
    });
  });

  it("writes a quantity under a kilo in grams", () => {
    expect(supplierItemLinkFormValuesOf({ ...ALMOND_LINK, quantity: 500 }, 3)).toMatchObject({
      quantity: "500",
      quantityUnit: "G",
    });
  });

  it("starts with the product but no quantity for a link that has to be made again", () => {
    expect(supplierItemLinkFormValuesOf({ ...ALMOND_LINK, current: false }, 3)).toMatchObject({
      productId: ALMOND_LINK.product.id,
      saleUnit: "KG",
      quantity: "",
    });
  });

  it("leaves the rate unchosen for a link made without one", () => {
    expect(supplierItemLinkFormValuesOf(ALMOND_LINK, 3).vatRate).toBe("");
  });
});

describe("vatRateOptionsOf", () => {
  it("offers no options when the cloud offers no rate", () => {
    expect(vatRateOptionsOf({ offered: [], default: 2100 })).toBeUndefined();
  });

  it("offers each rate the cloud offers, in its order, labelled as a percentage", () => {
    expect(vatRateOptionsOf({ offered: [2700, 1050], default: 1050 })).toEqual([
      { value: "2700", label: "27 %" },
      { value: "1050", label: "10,5 %" },
    ]);
  });
});

describe("vatRateOrDefault", () => {
  const vatRates = { offered: [2700, 1050], default: 1050 };

  it("chooses the default rate the cloud answers when none is chosen", () => {
    expect(vatRateOrDefault("", vatRates)).toBe("1050");
  });

  it("keeps the rate already chosen", () => {
    expect(vatRateOrDefault("2700", vatRates)).toBe("2700");
  });
});

describe("linkProductOptions", () => {
  it("offers every product by name", () => {
    expect(linkProductOptions(LINK_CHOICES)).toEqual([
      { value: "90d00000-0000-4000-8000-000000000003", label: "Almendras peladas" },
      { value: "90d00000-0000-4000-8000-000000000022", label: "Miel pura de abeja 1 kg" },
      { value: PASAS_ID, label: "Pasas de uva" },
    ]);
  });

  it("names each product with its brand and net content, so same-name products read differently", () => {
    const [other, kos] = GRANOLA_LINK_CHOICES.products as [
      (typeof GRANOLA_LINK_CHOICES.products)[number],
      (typeof GRANOLA_LINK_CHOICES.products)[number],
    ];

    expect(linkProductOptions(GRANOLA_LINK_CHOICES)).toEqual([
      { value: kos.id, label: "Granola Berries Kos 1 kg" },
      { value: other.id, label: "Granola Berries Naturalia 500 g" },
    ]);
  });

  it("offers nothing when there are no products", () => {
    expect(linkProductOptions({ ...LINK_CHOICES, products: [] })).toBeUndefined();
  });
});

describe("proposedProductIdOf", () => {
  it("answers the product proposed, by barcode or by the model", () => {
    expect(proposedProductIdOf(PROPOSED_BY_AI)).toBe(PASAS_ID);
  });

  it("answers nothing when there is no proposal, it could not be made or it is still loading", () => {
    expect(proposedProductIdOf(NO_PROPOSAL)).toBeNull();
    expect(proposedProductIdOf(UNAVAILABLE_PROPOSAL)).toBeNull();
    expect(proposedProductIdOf(undefined)).toBeNull();
  });
});
