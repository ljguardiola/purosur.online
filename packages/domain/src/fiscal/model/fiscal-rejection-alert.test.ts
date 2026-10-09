import { describe, expect, it } from "vitest";
import { FACTURA_C_DOCUMENT_TYPE, rejectionAlertChange } from "./fiscal-rejection-alert.js";

const SUBJECT = {
  pointOfSale: 12,
  documentType: FACTURA_C_DOCUMENT_TYPE,
  fiscalDocumentId: "fiscal-document-1",
  saleId: "sale-1",
} as const;

const REJECTIONS = [
  { code: 10242, message: "El campo CondicionIVAReceptorId es invalido." },
  { code: 10015, message: "Debe informar el documento del receptor." },
];

describe("FACTURA_C_DOCUMENT_TYPE", () => {
  it("names the invoice class C", () => {
    expect(FACTURA_C_DOCUMENT_TYPE).toBe("factura_c");
  });
});

describe("rejectionAlertChange", () => {
  it("opens the alert of the point of sale and document type for a content rejection, with what the tax authority said", () => {
    expect(
      rejectionAlertChange(
        { kind: "rejected", codes: [10242, 10015], rejectionClass: "content" },
        REJECTIONS,
        SUBJECT,
      ),
    ).toEqual({
      kind: "open",
      pointOfSale: 12,
      documentType: "factura_c",
      rejectionClass: "content",
      fiscalDocumentId: "fiscal-document-1",
      saleId: "sale-1",
      rejections: REJECTIONS,
    });
  });

  it("opens the alert for a standing rejection with its class", () => {
    expect(
      rejectionAlertChange(
        { kind: "rejected", codes: [10005], rejectionClass: "standing" },
        [{ code: 10005, message: "El punto de venta no es RECE." }],
        SUBJECT,
      ),
    ).toMatchObject({ kind: "open", rejectionClass: "standing" });
  });

  it("clears the alert of the point of sale and document type for an authorized document", () => {
    expect(
      rejectionAlertChange(
        {
          kind: "authorized",
          authorizationCode: "75123456789012",
          authorizationCodeDueOn: "2026-10-11",
        },
        [],
        SUBJECT,
      ),
    ).toEqual({ kind: "clear", pointOfSale: 12, documentType: "factura_c" });
  });

  it("changes nothing for an unclear answer", () => {
    expect(rejectionAlertChange({ kind: "unclear" }, [], SUBJECT)).toBeNull();
  });

  it("changes nothing when the call was not attempted", () => {
    expect(rejectionAlertChange({ kind: "not_attempted" }, [], SUBJECT)).toBeNull();
  });
});
