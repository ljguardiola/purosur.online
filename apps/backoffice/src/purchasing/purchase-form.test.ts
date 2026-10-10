import { CalendarDate } from "@internationalized/date";
import { purchaseRegistrationBodySchema } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import {
  emptyPurchaseForm,
  emptyPurchaseLine,
  nextPurchaseLineId,
  PURCHASE_FIELDS,
  PURCHASE_LINE_REFUSALS,
  type PurchaseFormValues,
  type PurchaseLineValues,
  priceReviewProductIds,
  purchaseLineQuantityRefusal,
  purchaseLinesMessage,
  purchasePackagingOptions,
  purchaseReceiptNumberMessage,
  purchaseRegistrationRequestFrom,
  purchaseSupplierOptions,
  RECEIPT_TYPE_OPTIONS,
} from "./purchase-form";
import {
  bolsaDeAlmendras,
  bolsaDeAvena,
  cajaDeMiel,
  packagableProducts,
} from "./test-support/packagings";
import { suppliersWithCuits } from "./test-support/suppliers";

const TODAY = new CalendarDate(2026, 9, 16);
const { andina, granos, cerealera } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

function line(overrides: Partial<PurchaseLineValues> = {}): PurchaseLineValues {
  return { ...emptyPurchaseLine(1), ...overrides };
}

function form(overrides: Partial<PurchaseFormValues> = {}): PurchaseFormValues {
  return {
    ...emptyPurchaseForm(TODAY),
    supplierId: andina.id,
    receiptType: "factura_b",
    receiptNumber: "0001-00001234",
    ...overrides,
  };
}

describe("emptyPurchaseForm", () => {
  it("starts on the given day with one empty line loaded by quantity and nothing chosen", () => {
    expect(emptyPurchaseForm(TODAY)).toEqual({
      supplierId: null,
      purchasedOn: TODAY,
      receiptType: null,
      receiptNumber: "",
      note: "",
      lines: [emptyPurchaseLine(1)],
    });
    expect(emptyPurchaseLine(1).loadedBy).toBe("quantity");
  });

  it("builds the same empty form every time it is asked for one", () => {
    expect(emptyPurchaseForm(TODAY)).toEqual(emptyPurchaseForm(TODAY));
  });

  it("leaves the purchase date empty while today is not known yet", () => {
    expect(emptyPurchaseForm(null)).toEqual({ ...emptyPurchaseForm(TODAY), purchasedOn: null });
  });
});

describe("nextPurchaseLineId", () => {
  it("gives a new line an id no line of the form has", () => {
    expect(nextPurchaseLineId([line({ id: 1 }), line({ id: 4 }), line({ id: 2 })])).toBe(5);
  });

  it("starts from one when the form has no line", () => {
    expect(nextPurchaseLineId([])).toBe(1);
  });
});

describe("purchaseRegistrationRequestFrom", () => {
  it("builds a line loaded by quantity in the product's sale unit and a line loaded by packaging", () => {
    const request = purchaseRegistrationRequestFrom(
      form({
        purchasedOn: new CalendarDate(2026, 9, 14),
        note: " Entrega de la tarde ",
        lines: [
          line({
            productId: bolsaDeAvena.productId,
            quantity: "12,5",
            cost: "25.000,50",
            lotNumber: " L-1 ",
            expiresOn: new CalendarDate(2027, 1, 31),
          }),
          line({
            productId: cajaDeMiel.productId,
            loadedBy: "packaging",
            packagingId: cajaDeMiel.id,
            packages: "2",
            cost: "14.400",
          }),
        ],
      }),
      packagableProducts,
    );

    expect(request).toEqual({
      supplierId: andina.id,
      purchasedOn: "2026-09-14",
      receiptType: "factura_b",
      receiptNumber: "0001-00001234",
      note: "Entrega de la tarde",
      lines: [
        {
          loadedBy: "quantity",
          productId: bolsaDeAvena.productId,
          quantity: 12_500,
          costPaidCents: 2_500_050,
          lotNumber: "L-1",
          expiresOn: "2027-01-31",
        },
        {
          loadedBy: "packaging",
          productId: cajaDeMiel.productId,
          packagingId: cajaDeMiel.id,
          packages: 2,
          costPaidCents: 1_440_000,
          lotNumber: "",
          expiresOn: "",
        },
      ],
    });
    expect(purchaseRegistrationBodySchema.safeParse(request).success).toBe(true);
  });

  it("reads a line loaded by quantity of a product sold by the unit in whole units", () => {
    const request = purchaseRegistrationBodySchema.parse(
      purchaseRegistrationRequestFrom(
        form({ lines: [line({ productId: cajaDeMiel.productId, quantity: "16", cost: "8" })] }),
        packagableProducts,
      ),
    );

    expect(request.lines[0]).toMatchObject({ quantity: 16_000, costPaidCents: 800 });
  });

  it("leaves the receipt type empty until one is chosen", () => {
    expect(
      purchaseRegistrationRequestFrom(form({ receiptType: null }), packagableProducts).receiptType,
    ).toBeNull();
  });

  it.each<[string, Partial<PurchaseFormValues>]>([
    ["no supplier", { supplierId: null }],
    ["no date", { purchasedOn: null }],
    ["no receipt type", { receiptType: null }],
    ["a receipt without a number", { receiptNumber: " " }],
    ["no line", { lines: [] }],
  ])("builds a request the contract refuses with %s", (_name, overrides) => {
    const request = purchaseRegistrationRequestFrom(form(overrides), packagableProducts);

    expect(purchaseRegistrationBodySchema.safeParse(request).success).toBe(false);
  });

  it.each([
    ["no product", { productId: null, quantity: "1", cost: "1" }],
    ["a quantity that is not a number", { quantity: "mucho", cost: "1" }],
    ["a kilo quantity with four decimals", { quantity: "1,2345", cost: "1" }],
    ["a cost that is not an amount", { quantity: "1", cost: "caro" }],
    ["no cost", { quantity: "1", cost: "" }],
  ] as const)("builds a line the contract refuses with %s", (_name, overrides) => {
    const request = purchaseRegistrationRequestFrom(
      form({ lines: [line({ productId: bolsaDeAvena.productId, ...overrides })] }),
      packagableProducts,
    );

    expect(purchaseRegistrationBodySchema.safeParse(request).success).toBe(false);
  });

  it.each([
    ["no packaging", { packagingId: null, packages: "1" }],
    ["a count that is not a whole number", { packagingId: cajaDeMiel.id, packages: "1,5" }],
    ["a count of zero", { packagingId: cajaDeMiel.id, packages: "0" }],
    ["no count", { packagingId: cajaDeMiel.id, packages: "" }],
  ] as const)("builds a packaged line the contract refuses with %s", (_name, overrides) => {
    const request = purchaseRegistrationRequestFrom(
      form({
        lines: [
          line({ productId: cajaDeMiel.productId, loadedBy: "packaging", cost: "5", ...overrides }),
        ],
      }),
      packagableProducts,
    );

    expect(purchaseRegistrationBodySchema.safeParse(request).success).toBe(false);
  });
});

describe("PURCHASE_FIELDS", () => {
  it("lands each body key on the form field of the same name", () => {
    expect(PURCHASE_FIELDS).toEqual({
      supplierId: "supplierId",
      purchasedOn: "purchasedOn",
      receiptType: "receiptType",
      receiptNumber: "receiptNumber",
      note: "note",
      lines: "lines",
    });
  });
});

describe("purchaseReceiptNumberMessage", () => {
  it("asks for the number when a receipt has none", () => {
    expect(purchaseReceiptNumberMessage(form({ receiptNumber: " " }))).toBe(
      "Ingresá el número del comprobante.",
    );
  });

  it("says a purchase without a receipt has no number", () => {
    expect(
      purchaseReceiptNumberMessage(form({ receiptType: "sin_comprobante", receiptNumber: "1" })),
    ).toBe("Una compra sin comprobante no lleva número.");
  });

  it("names the limit when the number is over it", () => {
    expect(purchaseReceiptNumberMessage(form({ receiptNumber: "1".repeat(51) }))).toBe(
      "El número puede tener hasta 50 caracteres.",
    );
  });
});

describe("purchaseLinesMessage", () => {
  const message = (lines: PurchaseLineValues[]) =>
    purchaseLinesMessage(form({ lines }), packagableProducts);

  it("asks for a line when there is none", () => {
    expect(message([])).toBe("Agregá al menos una línea.");
  });

  it("points at the first line with something to fix, numbered from one", () => {
    expect(
      message([
        line({ productId: bolsaDeAvena.productId, quantity: "1", cost: "10" }),
        line({ productId: null, quantity: "1", cost: "10" }),
      ]),
    ).toBe("Línea 2: Elegí el producto.");
  });

  it("asks for the packaging and its count of a line loaded by packaging", () => {
    const packaged = { productId: cajaDeMiel.productId, loadedBy: "packaging", cost: "5" } as const;

    expect(message([line({ ...packaged, packages: "1" })])).toBe("Línea 1: Elegí la presentación.");
    expect(message([line({ ...packaged, packagingId: cajaDeMiel.id, packages: "" })])).toBe(
      "Línea 1: Ingresá cuántas presentaciones compraste, en un número entero.",
    );
  });

  it("tells how to type the quantity in the product's sale unit", () => {
    expect(message([line({ productId: bolsaDeAvena.productId, quantity: "x", cost: "1" })])).toBe(
      "Línea 1: Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
    );
    expect(message([line({ productId: cajaDeMiel.productId, quantity: "x", cost: "1" })])).toBe(
      "Línea 1: Escribí una cantidad entera de unidades, por ejemplo 16.",
    );
  });

  it("tells how to type the cost paid", () => {
    expect(message([line({ productId: bolsaDeAvena.productId, quantity: "1", cost: "" })])).toBe(
      "Línea 1: Escribí el costo pagado con coma para los centavos, por ejemplo 1.250,50.",
    );
  });

  it("asks to review a line whose values are all well formed", () => {
    expect(message([line({ productId: bolsaDeAvena.productId, quantity: "0", cost: "1" })])).toBe(
      "Línea 1: Revisá los valores.",
    );
  });
});

describe("PURCHASE_LINE_REFUSALS", () => {
  it("says in Spanish why the cloud refused a line", () => {
    expect(PURCHASE_LINE_REFUSALS).toEqual({
      product_not_found: "Este producto ya no está disponible.",
      product_inactive: "Este producto ya no está activo.",
      packaging_not_found: "Esta presentación ya no está disponible.",
      packaging_inactive: "Esta presentación ya no está activa.",
      packaging_sale_unit_changed:
        "La presentación no coincide con la unidad de venta actual del producto.",
    });
  });
});

describe("purchaseLineQuantityRefusal", () => {
  it("tells how to type the quantity of a line loaded by quantity, in its product's sale unit", () => {
    expect(
      purchaseLineQuantityRefusal(line({ productId: bolsaDeAvena.productId }), packagableProducts),
    ).toBe("Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.");
    expect(
      purchaseLineQuantityRefusal(line({ productId: cajaDeMiel.productId }), packagableProducts),
    ).toBe("Escribí una cantidad entera de unidades, por ejemplo 16.");
  });

  it("says a line loaded by packaging adds up to more than a line may hold", () => {
    expect(
      purchaseLineQuantityRefusal(
        line({ productId: cajaDeMiel.productId, loadedBy: "packaging" }),
        packagableProducts,
      ),
    ).toBe("Son demasiadas presentaciones para una sola línea.");
  });
});

describe("RECEIPT_TYPE_OPTIONS", () => {
  it("offers every receipt type with its Spanish name, in the contract's order", () => {
    expect(RECEIPT_TYPE_OPTIONS).toEqual([
      { value: "factura_b", label: "Factura B" },
      { value: "factura_c", label: "Factura C" },
      { value: "remito", label: "Remito" },
      { value: "ticket", label: "Ticket" },
      { value: "otro", label: "Otro" },
      { value: "sin_comprobante", label: "Sin comprobante" },
    ]);
  });
});

describe("purchaseSupplierOptions", () => {
  it("offers every supplier the cloud offers, by name", () => {
    expect(purchaseSupplierOptions([granos, cerealera, andina])).toEqual([
      { value: cerealera.id, label: cerealera.name },
      { value: andina.id, label: andina.name },
      { value: granos.id, label: granos.name },
    ]);
  });

  it("offers nothing when there is no supplier", () => {
    expect(purchaseSupplierOptions([])).toBeUndefined();
  });
});

describe("purchasePackagingOptions", () => {
  it("offers every packaging of the chosen product the cloud offers, with its quantity in its sale unit", () => {
    expect(
      purchasePackagingOptions(
        [cajaDeMiel, bolsaDeAvena, bolsaDeAlmendras],
        bolsaDeAlmendras.productId,
      ),
    ).toEqual([{ value: bolsaDeAlmendras.id, label: "Bolsa de 2,5 kg (2,500 kg)" }]);
  });

  it("offers nothing before a product is chosen", () => {
    expect(purchasePackagingOptions([cajaDeMiel], null)).toEqual([]);
  });
});

describe("reviewPriceNow", () => {
  it("starts unchosen on every new line", () => {
    expect(emptyPurchaseLine(1).reviewPriceNow).toBe(false);
    expect(emptyPurchaseForm(TODAY).lines[0]?.reviewPriceNow).toBe(false);
  });

  it("is not part of the registration request", () => {
    const chosen = line({
      productId: bolsaDeAvena.productId,
      quantity: "12,5",
      cost: "2.000",
      reviewPriceNow: true,
    });
    const unchosen = { ...chosen, reviewPriceNow: false };

    expect(purchaseRegistrationRequestFrom(form({ lines: [chosen] }), packagableProducts)).toEqual(
      purchaseRegistrationRequestFrom(form({ lines: [unchosen] }), packagableProducts),
    );
    expect(
      JSON.stringify(
        purchaseRegistrationRequestFrom(form({ lines: [chosen] }), packagableProducts),
      ),
    ).not.toContain("reviewPriceNow");
  });
});

describe("priceReviewProductIds", () => {
  it("lists the products of the lines chosen for review, once each and in line order", () => {
    const lines = [
      line({ id: 1, productId: "product-b", reviewPriceNow: true }),
      line({ id: 2, productId: "product-a", reviewPriceNow: false }),
      line({ id: 3, productId: "product-c", reviewPriceNow: true }),
      line({ id: 4, productId: "product-b", reviewPriceNow: true }),
    ];

    expect(priceReviewProductIds(lines)).toEqual(["product-b", "product-c"]);
  });

  it("skips a chosen line that has no product", () => {
    expect(priceReviewProductIds([line({ productId: null, reviewPriceNow: true })])).toEqual([]);
  });

  it("lists nothing when no line is chosen", () => {
    expect(priceReviewProductIds([line({ productId: "product-a" })])).toEqual([]);
  });
});
