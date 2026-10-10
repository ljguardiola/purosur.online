import {
  ARGENTINA_TIME_ZONE,
  LOT_NUMBER_MAX_LENGTH,
  MAX_CASH_AMOUNT_CENTS,
  MAX_STOCK_QUANTITY,
  PURCHASE_NOTE_MAX_LENGTH,
  RECEIPT_NUMBER_MAX_LENGTH,
  RECEIPT_TYPES,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { purchaseRegistrationBodySchema } from "./purchase-registration.js";

const SUPPLIER_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const PACKAGING_ID = "33333333-3333-3333-3333-333333333333";

const packagedLine = {
  loadedBy: "packaging",
  productId: PRODUCT_ID,
  packagingId: PACKAGING_ID,
  packages: 2,
  costPaidCents: 1_450_050,
  lotNumber: "L-17",
  expiresOn: "2027-01-31",
};
const quantityLine = {
  loadedBy: "quantity",
  productId: PRODUCT_ID,
  quantity: 2_500,
  costPaidCents: 90_000,
  lotNumber: null,
  expiresOn: null,
};
const purchase = {
  supplierId: SUPPLIER_ID,
  purchasedOn: "2026-03-09",
  receiptType: "factura_b",
  receiptNumber: "0001-00001234",
  note: "Entrega de la tarde",
  lines: [packagedLine, quantityLine],
};

function firstFailure(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = purchaseRegistrationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

function withLine(line: unknown) {
  return { ...purchase, lines: [line] };
}

describe("purchaseRegistrationBodySchema", () => {
  it("accepts a purchase with a line loaded by packaging and one loaded by quantity", () => {
    expect(purchaseRegistrationBodySchema.safeParse(purchase).data).toEqual(purchase);
  });

  it("reads the supplier and product ids in lower case", () => {
    const parsed = purchaseRegistrationBodySchema.parse({
      ...purchase,
      supplierId: SUPPLIER_ID.replace(/1/g, "A"),
    });
    expect(parsed.supplierId).toBe(SUPPLIER_ID.replace(/1/g, "a"));
  });

  it.each([undefined, "", "nope", 7])("rejects the supplier id %j", (supplierId) => {
    expect(firstFailure({ ...purchase, supplierId })).toEqual({
      path: ["supplierId"],
      message: "supplierId must be a supplier's id",
    });
  });

  it.each([undefined, "", "2026-02-30", "2026-3-9", "09/03/2026", "0000-01-01", 20_260_309])(
    "rejects the purchase date %j",
    (purchasedOn) => {
      expect(firstFailure({ ...purchase, purchasedOn })).toEqual({
        path: ["purchasedOn"],
        message: "purchasedOn must be a calendar day in the form YYYY-MM-DD",
      });
    },
  );

  it.each(RECEIPT_TYPES)("accepts the receipt type %s", (receiptType) => {
    const receiptNumber = receiptType === "sin_comprobante" ? null : "123";
    expect(
      purchaseRegistrationBodySchema.safeParse({ ...purchase, receiptType, receiptNumber }).success,
    ).toBe(true);
  });

  it.each([undefined, "", "factura_a", "Remito", 1])(
    "rejects the receipt type %j",
    (receiptType) => {
      expect(firstFailure({ ...purchase, receiptType })).toEqual({
        path: ["receiptType"],
        message: `receiptType must be one of ${RECEIPT_TYPES.join(", ")}`,
      });
    },
  );

  it.each([null, undefined, "", "   "])(
    "rejects the receipt number %j for a receipt that has one",
    (receiptNumber) => {
      expect(firstFailure({ ...purchase, receiptNumber })).toEqual({
        path: ["receiptNumber"],
        message: "receiptNumber is required with a receipt and must be empty without one",
      });
    },
  );

  it("rejects a receipt number when there is no receipt", () => {
    expect(firstFailure({ ...purchase, receiptType: "sin_comprobante" })).toEqual({
      path: ["receiptNumber"],
      message: "receiptNumber is required with a receipt and must be empty without one",
    });
  });

  it.each([null, undefined, "", "  "])(
    "reads the receipt number %j of no receipt as none",
    (receiptNumber) => {
      const parsed = purchaseRegistrationBodySchema.parse({
        ...purchase,
        receiptType: "sin_comprobante",
        receiptNumber,
      });
      expect(parsed.receiptNumber).toBeNull();
    },
  );

  it("trims the receipt number and accepts one of exactly the domain's maximum length", () => {
    expect(
      purchaseRegistrationBodySchema.parse({ ...purchase, receiptNumber: "  0001-1 " })
        .receiptNumber,
    ).toBe("0001-1");
    expect(
      purchaseRegistrationBodySchema.safeParse({
        ...purchase,
        receiptNumber: "1".repeat(RECEIPT_NUMBER_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      firstFailure({ ...purchase, receiptNumber: "1".repeat(RECEIPT_NUMBER_MAX_LENGTH + 1) }),
    ).toEqual({
      path: ["receiptNumber"],
      message: `receiptNumber must be a string of at most ${RECEIPT_NUMBER_MAX_LENGTH} characters`,
    });
  });

  it("reads an empty note as none and trims a note", () => {
    expect(purchaseRegistrationBodySchema.parse({ ...purchase, note: "" }).note).toBeNull();
    expect(purchaseRegistrationBodySchema.parse({ ...purchase, note: undefined }).note).toBeNull();
    expect(purchaseRegistrationBodySchema.parse({ ...purchase, note: " hola " }).note).toBe("hola");
  });

  it("accepts a note of exactly the domain's maximum length and rejects a longer one", () => {
    expect(
      purchaseRegistrationBodySchema.safeParse({
        ...purchase,
        note: "a".repeat(PURCHASE_NOTE_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(firstFailure({ ...purchase, note: "a".repeat(PURCHASE_NOTE_MAX_LENGTH + 1) })).toEqual({
      path: ["note"],
      message: `note must be a string of at most ${PURCHASE_NOTE_MAX_LENGTH} characters`,
    });
  });

  it.each([undefined, null, [], "lines"])("rejects the lines %j", (lines) => {
    expect(purchaseRegistrationBodySchema.safeParse({ ...purchase, lines }).success).toBe(false);
  });

  it("needs at least one line", () => {
    expect(firstFailure({ ...purchase, lines: [] })?.path).toEqual(["lines"]);
  });

  it("declares the time zone the purchase date is a day of", () => {
    expect(purchaseRegistrationBodySchema.shape.purchasedOn.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });

  it("declares the maximum lengths and the quantity's units", () => {
    expect(purchaseRegistrationBodySchema.shape.note.meta()).toEqual({
      maxLength: PURCHASE_NOTE_MAX_LENGTH,
    });
    expect(purchaseRegistrationBodySchema.shape.receiptNumber.meta()).toEqual({
      maxLength: RECEIPT_NUMBER_MAX_LENGTH,
    });
  });

  it("strips keys it does not know", () => {
    const parsed = purchaseRegistrationBodySchema.parse({
      ...purchase,
      total: 5,
      lines: [{ ...quantityLine, unitCostCents: 5 }],
    });
    expect(parsed).toEqual({ ...purchase, lines: [quantityLine] });
  });

  it.each([null, undefined, "compra", 1, []])("rejects the body %j as not an object", (body) => {
    expect(purchaseRegistrationBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("a line of purchaseRegistrationBodySchema", () => {
  it.each([undefined, "", "other", "Packaging"])("rejects the way of loading %j", (loadedBy) => {
    expect(
      purchaseRegistrationBodySchema.safeParse(withLine({ ...quantityLine, loadedBy })).success,
    ).toBe(false);
  });

  it.each([undefined, "", "nope"])("rejects the product id %j", (productId) => {
    expect(firstFailure(withLine({ ...quantityLine, productId }))).toEqual({
      path: ["lines", 0, "productId"],
      message: "productId must be a product's id",
    });
  });

  it.each([undefined, "", "nope"])("rejects the packaging id %j", (packagingId) => {
    expect(firstFailure(withLine({ ...packagedLine, packagingId }))).toEqual({
      path: ["lines", 0, "packagingId"],
      message: "packagingId must be a packaging's id",
    });
  });

  it("accepts the smallest and the largest number of packages", () => {
    for (const packages of [1, MAX_STOCK_QUANTITY]) {
      expect(
        purchaseRegistrationBodySchema.safeParse(withLine({ ...packagedLine, packages })).success,
      ).toBe(true);
    }
  });

  it.each([undefined, null, "2", 0, -1, 1.5, MAX_STOCK_QUANTITY + 1, Number.NaN])(
    "rejects %j packages",
    (packages) => {
      expect(firstFailure(withLine({ ...packagedLine, packages }))).toEqual({
        path: ["lines", 0, "packages"],
        message: "packages must be a positive whole number",
      });
    },
  );

  it("accepts the smallest and the largest quantity a stock movement may carry", () => {
    for (const quantity of [1, MAX_STOCK_QUANTITY]) {
      expect(
        purchaseRegistrationBodySchema.safeParse(withLine({ ...quantityLine, quantity })).success,
      ).toBe(true);
    }
  });

  it.each([undefined, null, "2500", 0, -1000, 1.5, MAX_STOCK_QUANTITY + 1, Number.NaN])(
    "rejects the quantity %j",
    (quantity) => {
      expect(firstFailure(withLine({ ...quantityLine, quantity }))).toEqual({
        path: ["lines", 0, "quantity"],
        message: "quantity must be a positive integer number of thousandths",
      });
    },
  );

  it("declares the quantity's units", () => {
    const [packaging, quantity] = purchaseRegistrationBodySchema.shape.lines.element.options;
    expect(quantity.shape.quantity.meta()).toEqual({
      decimals: STOCK_QUANTITY_DECIMALS,
      perUnit: STOCK_QUANTITY_PER_UNIT,
    });
    expect(packaging.shape.lotNumber.meta()).toEqual({ maxLength: LOT_NUMBER_MAX_LENGTH });
  });

  it("accepts a cost of nothing and the largest cost a cash amount may hold", () => {
    for (const costPaidCents of [0, MAX_CASH_AMOUNT_CENTS]) {
      expect(
        purchaseRegistrationBodySchema.safeParse(withLine({ ...quantityLine, costPaidCents }))
          .success,
      ).toBe(true);
    }
  });

  it.each([undefined, null, "900", -1, 0.5, MAX_CASH_AMOUNT_CENTS + 1, Number.NaN])(
    "rejects the cost %j",
    (costPaidCents) => {
      expect(firstFailure(withLine({ ...quantityLine, costPaidCents }))).toEqual({
        path: ["lines", 0, "costPaidCents"],
        message: "costPaidCents must be a whole number of cents, not negative",
      });
    },
  );

  it("reads an empty or absent lot number and expiry as none", () => {
    for (const empty of [undefined, null, "", "  "]) {
      const parsed = purchaseRegistrationBodySchema.parse(
        withLine({ ...quantityLine, lotNumber: empty, expiresOn: empty }),
      );
      expect(parsed.lines[0]).toMatchObject({ lotNumber: null, expiresOn: null });
    }
  });

  it("trims a lot number and accepts one of exactly the domain's maximum length", () => {
    expect(
      purchaseRegistrationBodySchema.parse(withLine({ ...quantityLine, lotNumber: " L-1 " }))
        .lines[0],
    ).toMatchObject({ lotNumber: "L-1" });
    expect(
      purchaseRegistrationBodySchema.safeParse(
        withLine({ ...quantityLine, lotNumber: "a".repeat(LOT_NUMBER_MAX_LENGTH) }),
      ).success,
    ).toBe(true);
    expect(
      firstFailure(withLine({ ...quantityLine, lotNumber: "a".repeat(LOT_NUMBER_MAX_LENGTH + 1) })),
    ).toEqual({
      path: ["lines", 0, "lotNumber"],
      message: `lotNumber must be a string of at most ${LOT_NUMBER_MAX_LENGTH} characters`,
    });
  });

  it("accepts an expiry that is already past", () => {
    expect(
      purchaseRegistrationBodySchema.safeParse(
        withLine({ ...quantityLine, expiresOn: "2001-01-01" }),
      ).success,
    ).toBe(true);
  });

  it.each(["2027-02-30", "31/01/2027", "2027-1-31", 5])("rejects the expiry %j", (expiresOn) => {
    expect(firstFailure(withLine({ ...quantityLine, expiresOn }))).toEqual({
      path: ["lines", 0, "expiresOn"],
      message: "expiresOn must be a calendar day in the form YYYY-MM-DD",
    });
  });

  it("strips a packaging from a line loaded by quantity and a quantity from one loaded by packaging", () => {
    const parsed = purchaseRegistrationBodySchema.parse({
      ...purchase,
      lines: [
        { ...quantityLine, packagingId: PACKAGING_ID, packages: 3 },
        { ...packagedLine, quantity: 5_000 },
      ],
    });
    expect(parsed.lines).toEqual([quantityLine, packagedLine]);
  });
});
