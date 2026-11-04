import { CalendarDate } from "@internationalized/date";
import {
  type PurchaseOrderReceiptDraft,
  purchaseOrderReceiptBodySchema,
  purchaseRegistrationBodySchema,
} from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, expectTypeOf, it } from "vitest";
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
  purchaseLineRefusalsOf,
  purchaseLinesMessage,
  purchaseOrderReceiptFormFrom,
  purchaseOrderReceiptRequestFrom,
  purchaseProductOptions,
  purchaseReceiptNumberMessage,
  purchaseRegistrationRequestFrom,
  purchaseSupplierOptions,
  RECEIPT_TYPE_OPTIONS,
  withCreatedSupplier,
} from "./purchase-form";
import {
  AVENA_PRODUCT_ID,
  aceiteDeAlmendras,
  MIEL_PRODUCT_ID,
  purchasableProducts,
} from "./test-support/purchase-products";
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
  it("builds a line loaded by quantity in the product's sale unit and a line loaded by packages", () => {
    const request = purchaseRegistrationRequestFrom(
      form({
        purchasedOn: new CalendarDate(2026, 9, 14),
        note: " Entrega de la tarde ",
        lines: [
          line({
            productId: AVENA_PRODUCT_ID,
            quantity: "12,5",
            cost: "25.000,50",
            expiresOn: new CalendarDate(2027, 1, 31),
          }),
          line({
            productId: MIEL_PRODUCT_ID,
            loadedBy: "packages",
            packages: "2",
            quantityPerPackage: "12",
            cost: "14.400",
          }),
        ],
      }),
      purchasableProducts,
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
          productId: AVENA_PRODUCT_ID,
          quantity: 12_500,
          costPaidCents: 2_500_050,
          expiresOn: "2027-01-31",
        },
        {
          loadedBy: "packages",
          productId: MIEL_PRODUCT_ID,
          packages: 2,
          quantityPerPackage: 12_000,
          costPaidCents: 1_440_000,
          expiresOn: "",
        },
      ],
    });
    expect(purchaseRegistrationBodySchema.safeParse(request).success).toBe(true);
  });

  it("reads a line loaded by quantity of a product sold by the unit in whole units", () => {
    const request = purchaseRegistrationBodySchema.parse(
      purchaseRegistrationRequestFrom(
        form({ lines: [line({ productId: MIEL_PRODUCT_ID, quantity: "16", cost: "8" })] }),
        purchasableProducts,
      ),
    );

    expect(request.lines[0]).toMatchObject({ quantity: 16_000, costPaidCents: 800 });
  });

  it("leaves the receipt type empty until one is chosen", () => {
    expect(
      purchaseRegistrationRequestFrom(form({ receiptType: null }), purchasableProducts).receiptType,
    ).toBeNull();
  });

  it.each<[string, Partial<PurchaseFormValues>]>([
    ["no supplier", { supplierId: null }],
    ["no date", { purchasedOn: null }],
    ["no receipt type", { receiptType: null }],
    ["a receipt without a number", { receiptNumber: " " }],
    ["no line", { lines: [] }],
  ])("builds a request the contract refuses with %s", (_name, overrides) => {
    const request = purchaseRegistrationRequestFrom(form(overrides), purchasableProducts);

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
      form({ lines: [line({ productId: AVENA_PRODUCT_ID, ...overrides })] }),
      purchasableProducts,
    );

    expect(purchaseRegistrationBodySchema.safeParse(request).success).toBe(false);
  });

  it.each([
    ["a count that is not a whole number", { packages: "1,5", quantityPerPackage: "12" }],
    ["a count of zero", { packages: "0", quantityPerPackage: "12" }],
    ["no count", { packages: "", quantityPerPackage: "12" }],
    ["no quantity per package", { packages: "2", quantityPerPackage: "" }],
    ["a quantity per package of zero", { packages: "2", quantityPerPackage: "0" }],
    ["a fraction of a unit per package", { packages: "2", quantityPerPackage: "1,5" }],
  ] as const)(
    "builds a line loaded by packages the contract refuses with %s",
    (_name, overrides) => {
      const request = purchaseRegistrationRequestFrom(
        form({
          lines: [
            line({ productId: MIEL_PRODUCT_ID, loadedBy: "packages", cost: "5", ...overrides }),
          ],
        }),
        purchasableProducts,
      );

      expect(purchaseRegistrationBodySchema.safeParse(request).success).toBe(false);
    },
  );

  it("types the quantity per package in kilos for a product sold by weight", () => {
    const request = purchaseRegistrationRequestFrom(
      form({
        lines: [
          line({
            productId: AVENA_PRODUCT_ID,
            loadedBy: "packages",
            packages: "3",
            quantityPerPackage: "2,5",
            cost: "1",
          }),
        ],
      }),
      purchasableProducts,
    );

    expect(request.lines[0]).toMatchObject({ packages: 3, quantityPerPackage: 2_500 });
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
    purchaseLinesMessage(form({ lines }), purchasableProducts);

  it("asks for a line when there is none", () => {
    expect(message([])).toBe("Agregá al menos una línea.");
  });

  it("points at the first line with something to fix, numbered from one", () => {
    expect(
      message([
        line({ productId: AVENA_PRODUCT_ID, quantity: "1", cost: "10" }),
        line({ productId: null, quantity: "1", cost: "10" }),
      ]),
    ).toBe("Línea 2: Elegí el producto.");
  });

  it("asks for the count of packages and the quantity of each of a line loaded by packages", () => {
    const packaged = { productId: MIEL_PRODUCT_ID, loadedBy: "packages", cost: "5" } as const;

    expect(message([line({ ...packaged, packages: "", quantityPerPackage: "12" })])).toBe(
      "Línea 1: Ingresá cuántos paquetes compraste, en un número entero.",
    );
    expect(message([line({ ...packaged, packages: "2", quantityPerPackage: "" })])).toBe(
      "Línea 1: Escribí una cantidad entera de unidades, por ejemplo 16.",
    );
    expect(
      message([
        line({ productId: AVENA_PRODUCT_ID, loadedBy: "packages", cost: "5", packages: "2" }),
      ]),
    ).toBe("Línea 1: Escribí los kilos con hasta 3 decimales, por ejemplo 12,150.");
  });

  it("asks for at least one package when a line loaded by packages counts none", () => {
    const packaged = line({
      productId: MIEL_PRODUCT_ID,
      loadedBy: "packages",
      packages: "0",
      quantityPerPackage: "12",
      cost: "5",
    });

    expect(message([packaged])).toBe(
      "Línea 1: Ingresá cuántos paquetes compraste, en un número entero mayor a cero.",
    );
  });

  it("asks for fewer packages when a line counts more than may be recorded", () => {
    const packaged = line({
      productId: MIEL_PRODUCT_ID,
      loadedBy: "packages",
      packages: "3.000.000.000",
      quantityPerPackage: "1",
      cost: "5",
    });

    expect(message([packaged])).toBe(
      "Línea 1: Ingresá menos paquetes; son más de los que se pueden registrar.",
    );
  });

  it("tells how to type the quantity in the product's sale unit", () => {
    expect(message([line({ productId: AVENA_PRODUCT_ID, quantity: "x", cost: "1" })])).toBe(
      "Línea 1: Escribí los kilos con hasta 3 decimales, por ejemplo 12,150.",
    );
    expect(message([line({ productId: MIEL_PRODUCT_ID, quantity: "x", cost: "1" })])).toBe(
      "Línea 1: Escribí una cantidad entera de unidades, por ejemplo 16.",
    );
  });

  it("tells how to type the cost paid", () => {
    expect(message([line({ productId: AVENA_PRODUCT_ID, quantity: "1", cost: "" })])).toBe(
      "Línea 1: Escribí el costo pagado con hasta 2 decimales, por ejemplo 1.250,50.",
    );
  });

  it("asks to review a line whose values are all well formed", () => {
    expect(message([line({ productId: AVENA_PRODUCT_ID, quantity: "0", cost: "1" })])).toBe(
      "Línea 1: Revisá los valores.",
    );
  });
});

describe("PURCHASE_LINE_REFUSALS", () => {
  it("says in Spanish why the cloud refused a line", () => {
    expect(PURCHASE_LINE_REFUSALS).toEqual({
      product_not_found: "Este producto ya no está disponible.",
      product_inactive: "Este producto ya no está activo.",
    });
  });
});

describe("purchaseLineQuantityRefusal", () => {
  it("tells how to type the quantity of a line loaded by quantity, in its product's sale unit", () => {
    expect(
      purchaseLineQuantityRefusal(line({ productId: AVENA_PRODUCT_ID }), purchasableProducts),
    ).toBe("Escribí los kilos con hasta 3 decimales, por ejemplo 12,150.");
    expect(
      purchaseLineQuantityRefusal(line({ productId: MIEL_PRODUCT_ID }), purchasableProducts),
    ).toBe("Escribí una cantidad entera de unidades, por ejemplo 16.");
  });

  it("asks to review both quantities of a line loaded by packages", () => {
    expect(
      purchaseLineQuantityRefusal(
        line({ productId: MIEL_PRODUCT_ID, loadedBy: "packages" }),
        purchasableProducts,
      ),
    ).toBe("Revisá la cantidad de paquetes y la cantidad por paquete.");
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

describe("purchaseProductOptions", () => {
  it("takes only products that carry their brand name and net content", () => {
    expectTypeOf<{ id: string; name: string; saleUnit: "UNIT" }[]>().not.toExtend<
      Parameters<typeof purchaseProductOptions>[0]
    >();
  });

  it("offers the products by name, or none when there is none", () => {
    expect(
      purchaseProductOptions([...purchasableProducts].reverse())?.map((option) => option.label),
    ).toEqual(["Almendras peladas", "Avena arrollada", "Miel pura de abeja 1 kg"]);
    expect(purchaseProductOptions([])).toBeUndefined();
  });

  it("describes each product with its brand name and net content", () => {
    expect(
      purchaseProductOptions([aceiteDeAlmendras, ...purchasableProducts])?.map(
        (option) => option.label,
      ),
    ).toEqual([
      "Aceite de Almendras Vitora 30 ml",
      "Almendras peladas",
      "Avena arrollada",
      "Miel pura de abeja 1 kg",
    ]);
  });

  it("orders two presentations of one name by their net content", () => {
    const larger = { ...aceiteDeAlmendras, netContent: { quantity: 100, unit: "ML" } } as const;

    expect(
      purchaseProductOptions([larger, aceiteDeAlmendras])?.map((option) => option.label),
    ).toEqual(["Aceite de Almendras Vitora 30 ml", "Aceite de Almendras Vitora 100 ml"]);
  });
});

describe("reviewPriceNow", () => {
  it("starts unchosen on every new line", () => {
    expect(emptyPurchaseLine(1).reviewPriceNow).toBe(false);
    expect(emptyPurchaseForm(TODAY).lines[0]?.reviewPriceNow).toBe(false);
  });

  it("is not part of the registration request", () => {
    const chosen = line({
      productId: AVENA_PRODUCT_ID,
      quantity: "12,5",
      cost: "2.000",
      reviewPriceNow: true,
    });
    const unchosen = { ...chosen, reviewPriceNow: false };

    expect(purchaseRegistrationRequestFrom(form({ lines: [chosen] }), purchasableProducts)).toEqual(
      purchaseRegistrationRequestFrom(form({ lines: [unchosen] }), purchasableProducts),
    );
    expect(
      JSON.stringify(
        purchaseRegistrationRequestFrom(form({ lines: [chosen] }), purchasableProducts),
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

describe("withCreatedSupplier", () => {
  it("adds the supplier just created after the listed ones", () => {
    expect(withCreatedSupplier([andina, granos], cerealera)).toEqual([andina, granos, cerealera]);
  });

  it("keeps the list as it is once it already lists the supplier just created", () => {
    expect(withCreatedSupplier([andina, cerealera], cerealera)).toEqual([andina, cerealera]);
  });

  it("keeps the list as it is when no supplier was created", () => {
    expect(withCreatedSupplier([andina, granos], null)).toEqual([andina, granos]);
  });
});

describe("purchaseLineRefusalsOf", () => {
  const lines = [
    line({ productId: MIEL_PRODUCT_ID }),
    line({ id: 2, productId: AVENA_PRODUCT_ID }),
  ];

  it("shows a refused product on the line the cloud named", () => {
    expect(
      purchaseLineRefusalsOf(
        { kind: "line_refused", reason: "product_inactive", lineIndex: 1 },
        lines,
        purchasableProducts,
      ),
    ).toEqual({ 1: PURCHASE_LINE_REFUSALS.product_inactive });
  });

  it("shows a refused quantity on the line the cloud named, in its sale unit", () => {
    expect(
      purchaseLineRefusalsOf(
        { kind: "validation_failed", field: "lines", lineIndex: 1 },
        lines,
        purchasableProducts,
      ),
    ).toEqual({ 1: purchaseLineQuantityRefusal(lines[1], purchasableProducts) });
  });

  it("shows nothing for a refusal that names no line", () => {
    expect(
      purchaseLineRefusalsOf(
        { kind: "validation_failed", field: "lines" },
        lines,
        purchasableProducts,
      ),
    ).toBeUndefined();
    expect(purchaseLineRefusalsOf({ kind: "failed" }, lines, purchasableProducts)).toBeUndefined();
  });
});

describe("purchaseOrderReceiptRequestFrom", () => {
  it("builds the request of a purchase without its supplier, which the order fixes", () => {
    const values = form({
      purchasedOn: new CalendarDate(2026, 9, 14),
      lines: [line({ productId: AVENA_PRODUCT_ID, quantity: "12,5", cost: "25.000,50" })],
    });

    const request = purchaseOrderReceiptRequestFrom(values, purchasableProducts);

    expect(request).not.toHaveProperty("supplierId");
    const { supplierId: _supplierId, ...registration } = purchaseRegistrationRequestFrom(
      values,
      purchasableProducts,
    );
    expect(request).toEqual(registration);
    expect(purchaseOrderReceiptBodySchema.safeParse(request).success).toBe(true);
  });
});

describe("purchaseOrderReceiptFormFrom", () => {
  const draft: PurchaseOrderReceiptDraft = {
    supplier: { id: andina.id, name: andina.name },
    lines: [
      {
        loadedBy: "packages",
        product: {
          id: MIEL_PRODUCT_ID,
          name: "Miel pura de abeja 1 kg",
          brandName: null,
          netContent: null,
          saleUnit: "UNIT",
        },
        packages: 3,
        quantityPerPackage: 12_000,
        listCostPerPackageCents: 185_000,
      },
      {
        loadedBy: "quantity",
        product: {
          id: AVENA_PRODUCT_ID,
          name: "Avena arrollada",
          brandName: null,
          netContent: null,
          saleUnit: "KG",
        },
        quantity: 12_500,
        listCostPerSaleUnitCents: null,
      },
    ],
  };

  it("prefills one line per draft line, loaded the way the draft loads it, with the list cost as the cost", () => {
    const values = purchaseOrderReceiptFormFrom(draft);

    expect(values.supplierId).toBe(andina.id);
    expect(values.lines).toEqual([
      {
        ...emptyPurchaseLine(1),
        productId: MIEL_PRODUCT_ID,
        loadedBy: "packages",
        packages: "3",
        quantityPerPackage: "12",
        cost: "1.850,00",
      },
      {
        ...emptyPurchaseLine(2),
        productId: AVENA_PRODUCT_ID,
        loadedBy: "quantity",
        quantity: "12,500",
        cost: "",
      },
    ]);
  });

  it("leaves the date, the receipt and the note for the person to fill in", () => {
    expect(purchaseOrderReceiptFormFrom(draft)).toMatchObject({
      purchasedOn: null,
      receiptType: null,
      receiptNumber: "",
      note: "",
    });
  });

  it("prefills values the request builder reads back as what the draft proposes", () => {
    const request = purchaseOrderReceiptRequestFrom(
      purchaseOrderReceiptFormFrom(draft),
      purchasableProducts,
    );

    expect(request.lines).toEqual([
      {
        loadedBy: "packages",
        productId: MIEL_PRODUCT_ID,
        packages: 3,
        quantityPerPackage: 12_000,
        costPaidCents: 185_000,
        expiresOn: "",
      },
      {
        loadedBy: "quantity",
        productId: AVENA_PRODUCT_ID,
        quantity: 12_500,
        costPaidCents: Number.NaN,
        expiresOn: "",
      },
    ]);
  });
});
