import { CalendarDate } from "@internationalized/date";
import { purchaseHeaderCorrectionBodySchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  PURCHASE_HEADER_FIELDS,
  PURCHASE_HEADER_MESSAGES,
  purchaseHeaderCorrectionRequestFrom,
  purchaseHeaderValuesOf,
} from "./purchase-header-form";
import { compraDeAvena, compraDeMiel } from "./test-support/purchases";

describe("purchaseHeaderValuesOf", () => {
  it("starts from the purchase's date, receipt and note", () => {
    expect(purchaseHeaderValuesOf({ ...compraDeMiel, note: "Llegó tarde" })).toEqual({
      purchasedOn: new CalendarDate(2026, 9, 14),
      receiptType: "factura_b",
      receiptNumber: "0001-00001234",
      note: "Llegó tarde",
    });
  });

  it("starts a purchase without receipt or note with empty texts", () => {
    expect(purchaseHeaderValuesOf({ ...compraDeAvena, note: null })).toEqual({
      purchasedOn: new CalendarDate(2026, 9, 10),
      receiptType: "sin_comprobante",
      receiptNumber: "",
      note: "",
    });
  });
});

describe("purchaseHeaderCorrectionRequestFrom", () => {
  it("builds the request the cloud reads, trimming the texts", () => {
    const request = purchaseHeaderCorrectionRequestFrom({
      purchasedOn: new CalendarDate(2026, 9, 13),
      receiptType: "remito",
      receiptNumber: " 0001-00001243 ",
      note: " Llegó a la mañana ",
    });

    expect(request).toEqual({
      purchasedOn: "2026-09-13",
      receiptType: "remito",
      receiptNumber: "0001-00001243",
      note: "Llegó a la mañana",
    });
    expect(purchaseHeaderCorrectionBodySchema.safeParse(request).success).toBe(true);
  });

  it("leaves a missing date and receipt type for the shape to refuse", () => {
    const request = purchaseHeaderCorrectionRequestFrom({
      purchasedOn: null,
      receiptType: null,
      receiptNumber: "",
      note: "",
    });

    expect(purchaseHeaderCorrectionBodySchema.safeParse(request).success).toBe(false);
  });
});

describe("the header form's fields and messages", () => {
  it("lands each wire key the shape reads on the field that shows it", () => {
    expect(PURCHASE_HEADER_FIELDS).toEqual({
      purchasedOn: "purchasedOn",
      receiptType: "receiptType",
      receiptNumber: "receiptNumber",
      note: "note",
    });
  });

  it("reads each message the way the registration does", () => {
    const values = {
      purchasedOn: null,
      receiptType: "sin_comprobante",
      receiptNumber: "12",
      note: "",
    } as const;

    expect(PURCHASE_HEADER_MESSAGES.purchasedOn(values)).toBe("Ingresá la fecha de la compra.");
    expect(PURCHASE_HEADER_MESSAGES.receiptNumber(values)).toBe(
      "Una compra sin comprobante no lleva número.",
    );
    expect(PURCHASE_HEADER_MESSAGES.receiptType).toBe("Elegí el tipo de comprobante.");
    expect(
      PURCHASE_HEADER_MESSAGES.purchasedOn({
        ...values,
        purchasedOn: new CalendarDate(2030, 1, 1),
      }),
    ).toBe("La fecha de compra no puede ser posterior a hoy.");
    expect(PURCHASE_HEADER_MESSAGES.note(values)).toMatch(
      /^La nota puede tener hasta \d+ caracteres\.$/,
    );
  });
});
