import { FICTIONAL_CUIT, FICTIONAL_LEGAL_NAME } from "@purosur/domain/fiscal/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  insertFiscalDocument,
  insertOfflineFiscalDocument,
  insertOfflinePointOfSale,
  OFFLINE_CODE,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { readCreditNoteReceipt } from "./sqlite-credit-note-receipt";
import {
  ANSWERED_AT,
  ISSUED_AT,
  insertCreditNote,
  insertCreditNoteIssuedOffline,
  insertVoidedSale,
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
  it("is none for a credit note the register does not hold", () => {
    expect(readCreditNoteReceipt(database, "missing")).toBeNull();
  });

  it.each([
    [
      "in progress",
      {
        state: "IN_PROGRESS",
        point_of_sale: null,
        number: null,
        issued_on: null,
        issued_at: null,
        authorization_code: null,
        authorization_code_due_on: null,
        answered_at: null,
      },
    ],
    [
      "already credited",
      {
        state: "ALREADY_CREDITED",
        point_of_sale: null,
        number: null,
        issued_on: null,
        issued_at: null,
        authorization_code: null,
        authorization_code_due_on: null,
        answered_at: ANSWERED_AT,
      },
    ],
    [
      "rejected",
      {
        state: "REJECTED",
        point_of_sale: null,
        number: null,
        issued_on: null,
        issued_at: null,
        authorization_code: null,
        authorization_code_due_on: null,
      },
    ],
  ])("is none while the credit note is %s", (_state, answer) => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote(database, answer);

    expect(readCreditNoteReceipt(database, "note-1")).toBeNull();
  });

  it("carries the voided sale as it was sold, the moment its credit note was issued and each refund", () => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote(database);

    expect(readCreditNoteReceipt(database, "note-1")).toMatchObject({
      header: {
        address: "Av. Belgrano 1450",
        whatsappNumber: "11 5555-0100",
        instagramHandle: "@puro.sur",
      },
      operation: {
        occurredAt: new Date(ISSUED_AT),
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

    expect(readCreditNoteReceipt(database, "note-1")?.totals).toEqual({
      subtotal: 1190000,
      saleDiscount: { kind: "PERCENT", percent: 10, amount: 119000 },
      total: 1071000,
    });
  });

  it("carries the credit note's own authorization and the invoice it corrects, with its issuer and buyer", () => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote(database);

    const { fiscal } = readCreditNoteReceipt(database, "note-1") ?? {};

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

    expect(readCreditNoteReceipt(database, "note-1")?.fiscal).toMatchObject({
      issuer: { cuit: FICTIONAL_CUIT },
      corrects: { pointOfSale: 31, number: 8 },
    });
  });

  describe("issued offline", () => {
    it("carries the contingency document's number, its code and fortnight and the invoice it corrects", () => {
      insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
      insertOfflinePointOfSale(database, 31);
      insertCreditNoteIssuedOffline(database, { pointOfSale: 31, number: 9 });

      const receipt = readCreditNoteReceipt(database, "note-1");

      expect(receipt).toMatchObject({
        operation: { occurredAt: new Date("2026-09-30T12:30:00.000Z"), operationNumber: 482 },
        issuedOn: "2026-09-30",
        totals: { total: 1190000 },
        refunds: [
          { method: "CASH", amount: 700000 },
          { method: "TRANSFER", amount: 490000 },
        ],
        fiscal: {
          voucherTypeCode: 13,
          issuer: { legalName: FICTIONAL_LEGAL_NAME, cuit: FICTIONAL_CUIT },
          buyerTaxStatusDescription: "Consumidor Final",
          pointOfSale: 31,
          number: 9,
          authorizationCode: OFFLINE_CODE,
          fortnight: { start: "2026-09-16", end: "2026-09-30" },
          corrects: { voucherType: 11, pointOfSale: 12, number: 41 },
        },
      });
      expect(receipt?.fiscal).not.toHaveProperty("authorizationCodeDueOn");
    });

    it("encodes the contingency code in the QR", () => {
      insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
      insertOfflinePointOfSale(database, 31);
      insertCreditNoteIssuedOffline(database, { pointOfSale: 31, number: 9 });

      const qr = JSON.parse(
        atob(readCreditNoteReceipt(database, "note-1")?.fiscal.qrText.split("?p=")[1] ?? ""),
      );

      expect(qr).toMatchObject({
        tipoCmp: 13,
        ptoVta: 31,
        nroCmp: 9,
        importe: 11900,
        tipoCodAut: "A",
        codAut: Number(OFFLINE_CODE),
      });
    });

    it("reads the issuer from the contingency invoice, not from a credit note that shares its point of sale and number", () => {
      insertOfflinePointOfSale(database, 31);
      insertOfflineFiscalDocument(database, { saleId: "sale-1", pointOfSale: 31, number: 8 });
      insertCreditNoteIssuedOffline(
        database,
        { pointOfSale: 31, number: 8 },
        { pointOfSale: 31, number: 8 },
      );

      expect(readCreditNoteReceipt(database, "note-1")?.fiscal).toMatchObject({
        issuer: { cuit: FICTIONAL_CUIT },
        corrects: { pointOfSale: 31, number: 8 },
      });
    });
  });
});

describe("the receipt of the credit note of a return", () => {
  const RETURNED_AT = "2026-10-02T15:00:00.000Z";

  function insertReturnCreditNote(creditNoteId = "note-r1", returnId = "return-1") {
    database
      .prepare(
        `INSERT INTO sale_void_credit_notes (
           id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
           corrected_voucher_type, corrected_point_of_sale, corrected_number, state, point_of_sale,
           number, issued_on, issued_at, authorization_code, authorization_code_due_on, recorded_at,
           answered_at
         ) VALUES (
           @id, 'sale-1', @return_id, '2026-10-02', 420000, 5, 11, 12, 41, 'AUTHORIZED', 12, 8,
           '2026-10-02', '2026-10-02T15:00:02.000Z', '71234567890888', '2026-10-12', '${RETURNED_AT}',
           '2026-10-02T15:00:05.000Z'
         )`,
      )
      .run({ id: creditNoteId, return_id: returnId });
  }

  beforeEach(() => {
    database.exec(
      `UPDATE sales SET state = 'COMPLETED', voided_at = NULL;
       DELETE FROM payment_refunds;
       INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
       VALUES ('return-1', 'sale-1', 'r1', 'device-1', 's1', 'u1', 'QR', '${RETURNED_AT}');
       INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
       VALUES ('return-1', 'line-1', 1, 'change_of_mind', 'restock', 420000);
       INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at, return_id)
       VALUES ('refund-r1', 'pay-1', 'CASH', 'NONE', 420000, 'APPROVED', '${RETURNED_AT}', 'return-1');`,
    );
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
  });

  it("carries only what the return gave back, its refund and the moment the credit note was issued", () => {
    insertReturnCreditNote();

    expect(readCreditNoteReceipt(database, "note-r1")).toMatchObject({
      header: { address: "Av. Belgrano 1450" },
      operation: {
        occurredAt: new Date("2026-10-02T15:00:02.000Z"),
        servedByFirstName: "Ada",
        operationNumber: 482,
      },
      issuedOn: "2026-10-02",
      lines: [{ productName: "Alfajor", quantity: 1, listUnitPrice: 420000, lineTotal: 420000 }],
      totals: { subtotal: 420000, saleDiscount: null, total: 420000 },
      refunds: [{ method: "CASH", amount: 420000 }],
      fiscal: {
        voucherTypeCode: 13,
        pointOfSale: 12,
        number: 8,
        corrects: { voucherType: 11, pointOfSale: 12, number: 41 },
      },
    });
  });

  it("leaves out what another return of the sale gave back", () => {
    database.exec(
      `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
       VALUES ('return-2', 'sale-1', 'r1', 'device-1', 's1', 'u1', 'QR', '2026-10-03T15:00:00.000Z');
       INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
       VALUES ('return-2', 'line-2', 1, 'defective', 'discard', 350000);
       INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at, return_id)
       VALUES ('refund-r2', 'pay-2', 'TRANSFER', 'NONE', 350000, 'PENDING', '2026-10-03T15:00:00.000Z', 'return-2');`,
    );
    insertReturnCreditNote();

    const receipt = readCreditNoteReceipt(database, "note-r1");

    expect(receipt?.lines.map(({ productName }) => productName)).toEqual(["Alfajor"]);
    expect(receipt?.refunds).toEqual([{ method: "CASH", amount: 420000 }]);
  });

  it("leaves out the refund of a return made at the very same moment", () => {
    database.exec(
      `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
       VALUES ('return-2', 'sale-1', 'r1', 'device-1', 's1', 'u1', 'QR', '${RETURNED_AT}');
       INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
       VALUES ('return-2', 'line-2', 1, 'defective', 'discard', 350000);
       INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at, return_id)
       VALUES ('refund-r2', 'pay-2', 'TRANSFER', 'NONE', 350000, 'PENDING', '${RETURNED_AT}', 'return-2');`,
    );
    insertReturnCreditNote();

    expect(readCreditNoteReceipt(database, "note-r1")?.refunds).toEqual([
      { method: "CASH", amount: 420000 },
    ]);
  });

  it("is none while the credit note of the return is not authorized", () => {
    database
      .prepare(
        `INSERT INTO sale_void_credit_notes (
           id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
           corrected_voucher_type, corrected_point_of_sale, corrected_number, state, recorded_at
         ) VALUES (
           'note-r1', 'sale-1', 'return-1', '2026-10-02', 420000, 5, 11, 12, 41, 'IN_PROGRESS',
           '${RETURNED_AT}'
         )`,
      )
      .run();

    expect(readCreditNoteReceipt(database, "note-r1")).toBeNull();
  });
});
