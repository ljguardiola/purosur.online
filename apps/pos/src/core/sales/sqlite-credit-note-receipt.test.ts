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

const SOLD_AT = "2026-09-30T15:05:00.000Z";
const VOIDED_AT = "2026-09-30T15:40:00.000Z";

let database: LocalDatabase;

function insertVoidedSale(): void {
  database.exec(
    `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'u1', '2026-09-30T12:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number, voided_at)
     VALUES ('sale-1', 'r1', 'device-1', 's1', 'u1', 'VOIDED', '${SOLD_AT}', 482, '${VOIDED_AT}');
     INSERT INTO products (id, name, category_id, sale_unit, active, version)
     VALUES ('p1', 'Alfajor del catalogo', 'c', 'UNIT', 1, 1), ('p2', 'Yerba del catalogo', 'c', 'UNIT', 1, 1);
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, sale_unit, quantity, list_unit_price, price_list_id, discount_amount, line_total)
     VALUES ('line-1', 'sale-1', 1, 'p1', 'Alfajor', 'UNIT', 2, 420000, 'list-1', 0, 840000),
            ('line-2', 'sale-1', 2, 'p2', 'Yerba', 'UNIT', 1, 350000, 'list-1', 0, 350000);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
     VALUES ('pay-1', 'sale-1', 'SALE', 'CASH', 'NONE', 700000, 800000, NULL, NULL, 'APPROVED', '${SOLD_AT}'),
            ('pay-2', 'sale-1', 'SALE', 'TRANSFER', 'NONE', 490000, NULL, 'u1', '${SOLD_AT}', 'APPROVED', '${SOLD_AT}');
     INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
     VALUES ('refund-1', 'pay-1', 'CASH', 'NONE', 700000, 'APPROVED', '${VOIDED_AT}'),
            ('refund-2', 'pay-2', 'TRANSFER', 'NONE', 490000, 'PENDING', '${VOIDED_AT}');`,
  );
}

function insertCreditNote(
  answer: Partial<{
    state: string;
    point_of_sale: number | null;
    number: number | null;
    issued_on: string | null;
    authorization_code: string | null;
    authorization_code_due_on: string | null;
    answered_at: string | null;
  }> = {},
  corrects = { pointOfSale: 12, number: 41 },
): void {
  database
    .prepare(
      `INSERT INTO sale_void_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
         authorization_code, authorization_code_due_on, recorded_at, answered_at
       ) VALUES (
         'note-1', 'sale-1', 1190000, 5, 11, @corrected_point_of_sale, @corrected_number,
         @state, @point_of_sale, @number, @issued_on, @authorization_code,
         @authorization_code_due_on, '${VOIDED_AT}', @answered_at
       )`,
    )
    .run({
      corrected_point_of_sale: corrects.pointOfSale,
      corrected_number: corrects.number,
      state: "AUTHORIZED",
      point_of_sale: 12,
      number: 7,
      issued_on: "2026-09-30",
      authorization_code: "71234567890999",
      authorization_code_due_on: "2026-10-10",
      answered_at: "2026-09-30T15:40:05.000Z",
      ...answer,
    });
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    "INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1); UPDATE sync_state SET device_id = 'device-1';",
  );
  insertVoidedSale();
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
    insertCreditNote(answer);

    expect(readCreditNoteReceipt(database, "sale-1")).toBeNull();
  });

  it("carries the voided sale as it was sold, the moment it was voided and each refund", () => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote();

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
    insertCreditNote();

    expect(readCreditNoteReceipt(database, "sale-1")?.totals).toEqual({
      subtotal: 1190000,
      saleDiscount: { kind: "PERCENT", percent: 10, amount: 119000 },
      total: 1071000,
    });
  });

  it("carries the credit note's own authorization and the invoice it corrects, with its issuer and buyer", () => {
    insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
    insertCreditNote();

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
    insertCreditNote({}, { pointOfSale: 31, number: 8 });

    expect(readCreditNoteReceipt(database, "sale-1")?.fiscal).toMatchObject({
      issuer: { cuit: FICTIONAL_CUIT },
      corrects: { pointOfSale: 31, number: 8 },
    });
  });
});
