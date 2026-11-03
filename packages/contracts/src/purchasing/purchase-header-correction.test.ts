import { RECEIPT_NUMBER_MAX_LENGTH, RECEIPT_TYPES } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { purchaseHeaderCorrectionBodySchema } from "./purchase-header-correction.js";

const header = {
  purchasedOn: "2026-03-09",
  receiptType: "factura_b",
  receiptNumber: "0001-00001243",
  note: "Entrega de la tarde",
};

function firstFailure(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = purchaseHeaderCorrectionBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("purchaseHeaderCorrectionBodySchema", () => {
  it("accepts the purchase's date, receipt and note", () => {
    expect(purchaseHeaderCorrectionBodySchema.safeParse(header).data).toEqual(header);
  });

  it("carries no supplier, whatever the body says", () => {
    const parsed = purchaseHeaderCorrectionBodySchema.parse({ ...header, supplierId: "x" });

    expect(parsed).not.toHaveProperty("supplierId");
  });

  it.each([undefined, "", "2026-02-30", "09/03/2026"])("rejects the date %j", (purchasedOn) => {
    expect(firstFailure({ ...header, purchasedOn })).toEqual({
      path: ["purchasedOn"],
      message: "purchasedOn must be a calendar day in the form YYYY-MM-DD",
    });
  });

  it.each(["factura_a", "", undefined])("rejects the receipt type %j", (receiptType) => {
    expect(firstFailure({ ...header, receiptType })).toEqual({
      path: ["receiptType"],
      message: `receiptType must be one of ${RECEIPT_TYPES.join(", ")}`,
    });
  });

  it("rejects a receipt without a number and a number without a receipt", () => {
    const message = "receiptNumber is required with a receipt and must be empty without one";

    expect(firstFailure({ ...header, receiptNumber: null })).toEqual({
      path: ["receiptNumber"],
      message,
    });
    expect(firstFailure({ ...header, receiptType: "sin_comprobante" })).toEqual({
      path: ["receiptNumber"],
      message,
    });
  });

  it("reads no receipt with an empty number as none", () => {
    const parsed = purchaseHeaderCorrectionBodySchema.parse({
      ...header,
      receiptType: "sin_comprobante",
      receiptNumber: "  ",
    });

    expect(parsed.receiptNumber).toBeNull();
  });

  it("limits the receipt number and the note like the registration", () => {
    expect(
      firstFailure({ ...header, receiptNumber: "1".repeat(RECEIPT_NUMBER_MAX_LENGTH + 1) })?.path,
    ).toEqual(["receiptNumber"]);
    expect(firstFailure({ ...header, note: "n".repeat(201) })?.path).toEqual(["note"]);
  });

  it("reads an empty note as none", () => {
    expect(purchaseHeaderCorrectionBodySchema.parse({ ...header, note: " " }).note).toBeNull();
  });
});
