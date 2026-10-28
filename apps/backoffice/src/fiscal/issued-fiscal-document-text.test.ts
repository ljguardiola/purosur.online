import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { expect, test } from "vitest";
import {
  authorizationDetailText,
  authorizationText,
  buyerText,
  correctedVoucherText,
  documentsCountText,
  issuedDay,
  issuedTime,
  voucherDetailText,
  voucherText,
} from "./issued-fiscal-document-text";
import {
  authorizedReceipt,
  contingencyReceipt,
  creditNote,
  unauthorizedReceipt,
} from "./test-support/issued-fiscal-documents-fixtures";

const FICTIONAL_CUIT_NUMBER = Number(FICTIONAL_CUIT.replaceAll("-", ""));

test.each([
  [authorizedReceipt, "Factura C 00003-00001247"],
  [creditNote, "Nota de crédito C 00003-00000041"],
  [contingencyReceipt, "Factura C 00007-00000088"],
])("titles %j as %s", (document, title) => {
  expect(voucherText(document)).toBe(title);
});

test("names a voucher type the listing does not know by its code", () => {
  expect(voucherText({ ...authorizedReceipt, voucher_type: 99 })).toBe(
    "Comprobante tipo 99 00003-00001247",
  );
});

test("writes the voucher a credit note corrects the way a voucher is titled", () => {
  expect(voucherText({ voucher_type: 11, point_of_sale: 3, number: 1246 })).toBe(
    "Factura C 00003-00001246",
  );
});

test("describes a receipt by its register", () => {
  expect(voucherDetailText(authorizedReceipt)).toBe("Caja principal");
});

test("adds the contingency to the register of a document issued in contingency", () => {
  expect(voucherDetailText(contingencyReceipt)).toBe("Caja del fondo · en contingencia");
});

test("adds the voucher a credit note cancels to its register", () => {
  expect(voucherDetailText(creditNote)).toBe("Caja principal · Anula la Factura C 00003-00001246");
});

test.each([
  [authorizedReceipt, "CAE 75123456789012"],
  [contingencyReceipt, "CAEA 36251478963214"],
  [unauthorizedReceipt, "Sin autorización todavía"],
])("writes the authorization of %j as %s", (document, text) => {
  expect(authorizationText(document.authorization)).toBe(text);
});

test.each([
  [authorizedReceipt, "Vence el 26/09/2026"],
  [contingencyReceipt, "Quincena 16 al 30/09"],
  [unauthorizedReceipt, "No se reintenta sin consultar"],
])("explains the state of %j with %s", (document, text) => {
  expect(authorizationDetailText(document)).toBe(text);
});

test("writes the day a document was issued", () => {
  expect(issuedDay(authorizedReceipt)).toBe("12/09/2026");
});

test("writes the time a document was issued in Argentina", () => {
  expect(issuedTime(authorizedReceipt)).toBe("12:04");
  expect(issuedTime(contingencyReceipt)).toBe("11:15");
});

test("counts documents with the period they were listed for", () => {
  expect(documentsCountText(131, { from: "2026-09-01", to: "2026-09-30" })).toBe(
    "131 comprobantes · del 01/09/2026 al 30/09/2026",
  );
});

test("counts a single document and names a one-day period once", () => {
  expect(documentsCountText(1, { from: "2026-09-12", to: "2026-09-12" })).toBe(
    "1 comprobante · 12/09/2026",
  );
});

test("writes the final consumer as the buyer", () => {
  expect(buyerText({ kind: "final_consumer" })).toBe("Consumidor final");
});

test.each([
  ["dni", 12345678, "DNI 12345678"],
  ["cuit", FICTIONAL_CUIT_NUMBER, `CUIT ${FICTIONAL_CUIT}`],
  ["cuil", FICTIONAL_CUIT_NUMBER, `CUIL ${FICTIONAL_CUIT}`],
  ["cdi", 12345678, "CDI 12345678"],
  ["other", 12345678, "Documento 12345678"],
] as const)("writes a buyer identified by a %s numbered %i as %s", (kind, number, text) => {
  expect(buyerText({ kind: "identified", document_kind: kind, document_number: number })).toBe(
    text,
  );
});

test("names the receipt a credit note corrects", () => {
  expect(correctedVoucherText({ voucher_type: 11, point_of_sale: 3, number: 1246 })).toBe(
    "Corrige la Factura C 00003-00001246",
  );
});
