import { parseDate } from "@internationalized/date";
import { purchaseLineExpirySplitBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_PURCHASE_LINE_EXPIRY_SPLIT,
  PURCHASE_LINE_EXPIRY_SPLIT_FIELDS,
  purchaseLineExpirySplitMessages,
  purchaseLineExpirySplitRequestFrom,
  purchaseLineExpirySplitValuesOf,
} from "./purchase-line-expiry-split-form";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;

describe("purchaseLineExpirySplitValuesOf", () => {
  it("starts with no units typed and the line's expiry date", () => {
    expect(lineDeMiel && purchaseLineExpirySplitValuesOf(lineDeMiel)).toEqual({
      quantity: "",
      expiresOn: parseDate("2027-01-31"),
    });
  });

  it("starts with no date for a line without expiry date", () => {
    expect(lineDeAvena && purchaseLineExpirySplitValuesOf(lineDeAvena)).toEqual({
      quantity: "",
      expiresOn: null,
    });
  });

  it("starts empty before any line is chosen", () => {
    expect(EMPTY_PURCHASE_LINE_EXPIRY_SPLIT).toEqual({ quantity: "", expiresOn: null });
  });
});

describe("purchaseLineExpirySplitRequestFrom", () => {
  it.each([
    ["1", "UNIT", 1_000],
    ["12", "UNIT", 12_000],
    ["2,5", "KG", 2_500],
    ["0,250", "KG", 250],
  ] as const)("sends %s of a %s product as %i stock units", (quantity, saleUnit, sent) => {
    const request = purchaseLineExpirySplitRequestFrom(
      { quantity, expiresOn: parseDate("2027-11-10") },
      saleUnit,
    );

    expect(request).toEqual({ quantity: sent, expiresOn: "2027-11-10" });
    expect(purchaseLineExpirySplitBodySchema.safeParse(request).success).toBe(true);
  });

  it("sends an emptied date as no expiry date", () => {
    expect(
      purchaseLineExpirySplitRequestFrom({ quantity: "1", expiresOn: null }, "UNIT").expiresOn,
    ).toBeNull();
  });

  it.each([
    ["", "UNIT"],
    ["abc", "UNIT"],
    ["0", "UNIT"],
    ["1,5", "UNIT"],
    ["1,2345", "KG"],
  ] as const)("sends %j of a %s product as a quantity the shape refuses", (quantity, saleUnit) => {
    expect(
      purchaseLineExpirySplitBodySchema.safeParse(
        purchaseLineExpirySplitRequestFrom({ quantity, expiresOn: null }, saleUnit),
      ).success,
    ).toBe(false);
  });
});

describe("the split form's fields and messages", () => {
  it("lands each wire key on its field", () => {
    expect(PURCHASE_LINE_EXPIRY_SPLIT_FIELDS).toEqual({
      quantity: "quantity",
      expiresOn: "expiresOn",
    });
  });

  it("asks for whole units of a product sold by unit", () => {
    expect(purchaseLineExpirySplitMessages("UNIT")).toEqual({
      quantity: "Escribí una cantidad entera de unidades, por ejemplo 16.",
      expiresOn: "Ingresá una fecha de vencimiento válida.",
    });
  });

  it("asks for kilos with up to 3 decimals of a product sold by weight", () => {
    expect(purchaseLineExpirySplitMessages("KG").quantity).toBe(
      "Escribí los kilos con hasta 3 decimales, por ejemplo 12,150.",
    );
  });
});
