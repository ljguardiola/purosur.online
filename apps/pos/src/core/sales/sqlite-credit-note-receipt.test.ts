import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  insertFiscalDocument,
  insertOfflineFiscalDocument,
  insertOfflinePointOfSale,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { readCreditNoteReceipt } from "./sqlite-credit-note-receipt";
import {
  insertCreditNote,
  insertVoidedSale,
  VOIDED_AT,
} from "./test-support/credit-note-receipt-database";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    "INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1); UPDATE sync_state SET device_id = 'device-1';",
  );
  insertVoidedSale(database);
});

afterEach(() => {
  database.close();
});

describe("the receipt of the credit note of a voided sale", () => {
  it("is none for a sale without a credit note", () => {
    expect(readCreditNoteReceipt(database, "sale-1")).toBeNull();
  });

  it.each([
    [
      "in progress",
      {
        state: "IN_PROGRESS",
        point_of_sale: null,
        number: null,
        issued_on: null,
        authorization_code: null,
        authorization_code_due_on: null,
        answered_at: null,
      },
    ],
    [
      "rejected",
      {
        state: "REJECTED",
        point_of_sale: null,
        number: null,
        issued_on: null,
        authorization_code: null,
        authorization_code_due_on: null,
      },
    ],
  ])("is none while the credit note is %s", (_state, answer) => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote(database, answer);

    expect(readCreditNoteReceipt(database, "sale-1")).toBeNull();
  });

  it("carries the voided sale as it was sold, the moment it was voided and each refund", () => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote(database);

    expect(readCreditNoteReceipt(database, "sale-1")).toMatchObject({
      header: {
        address: "Av. Belgrano 1450",
        whatsappNumber: "11 5555-0100",
        instagramHandle: "@puro.sur",
      },
      operation: {
        occurredAt: new Date(VOIDED_AT),
        servedByFirstName: "Ada",
        operationNumber: 482,
      },
      issuedOn: "2026-09-30",
      lines: [
        { productName: "Alfajor", quantity: 2, lineTotal: 840000 },
        { productName: "Yerba", quantity: 1, lineTotal: 350000 },
      ],
      totals: { subtotal: 1190000, saleDiscount: null, total: 1190000 },
      refunds: [
        { method: "CASH", amount: 700000 },
        { method: "TRANSFER", amount: 490000 },
      ],
    });
  });

  it("carries the discount on the total of the sale", () => {
    database.exec(
      "UPDATE sales SET sale_discount_kind = 'PERCENT', sale_discount_value = 10, sale_discount_reason = 'Cliente', sale_discount_authorized_by = 'u1'",
    );
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote(database);

    expect(readCreditNoteReceipt(database, "sale-1")?.totals).toEqual({
      subtotal: 1190000,
      saleDiscount: { kind: "PERCENT", percent: 10, amount: 119000 },
      total: 1071000,
    });
  });

  it("carries the credit note's own authorization and the invoice it corrects, with its issuer and buyer", () => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote(database);

    const { fiscal } = readCreditNoteReceipt(database, "sale-1") ?? {};

    expect(fiscal).toMatchObject({
      voucherTypeCode: 13,
      issuer: { legalName: FICTIONAL_LEGAL_NAME, cuit: FICTIONAL_CUIT },
      buyerTaxStatusDescription: "Consumidor Final",
      pointOfSale: 12,
      number: 7,
      authorizationCode: "71234567890999",
      authorizationCodeDueOn: "2026-10-10",
      corrects: { voucherType: 11, pointOfSale: 12, number: 41 },
    });
    const qr = JSON.parse(atob(fiscal?.qrText.split("?p=")[1] ?? ""));
    expect(qr).toMatchObject({
      tipoCmp: 13,
      ptoVta: 12,
      nroCmp: 7,
      fecha: "2026-09-30",
      importe: 11900,
      codAut: 71234567890999,
    });
  });

  it("reads the issuer from the contingency document the credit note corrects", () => {
    insertOfflinePointOfSale(database, 31);
    insertOfflineFiscalDocument(database, { saleId: "sale-1", pointOfSale: 31, number: 8 });
    insertCreditNote(database, {}, { pointOfSale: 31, number: 8 });

    expect(readCreditNoteReceipt(database, "sale-1")?.fiscal).toMatchObject({
      issuer: { cuit: FICTIONAL_CUIT },
      corrects: { pointOfSale: 31, number: 8 },
    });
  });
});
