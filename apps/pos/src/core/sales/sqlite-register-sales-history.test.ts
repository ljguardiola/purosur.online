import { type FiscalDocumentState, type SaleStanding, saleStandingOf } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uniqueShortCode } from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteRegisterSalesHistory } from "./sqlite-register-sales-history";

interface SaleSeed {
  id: string;
  session?: string;
  register?: string;
  state?: string;
  occurredAt?: string | null;
  operationNumber?: number | null;
  actor?: string;
  lines?: number[];
  payments?: { method: "CASH" | "TRANSFER" | "QR"; amount: number }[];
  fiscal?: { state: FiscalDocumentState; pointOfSale?: number; number?: number };
  deferred?: boolean | "satisfied" | "cancelled";
  offlineDocument?: { pointOfSale: number; number: number };
}

const DECIDED_STANDINGS = ["completed", "in_progress", "deferred", "voided"] as const;

let database: LocalDatabase;
let history: SqliteRegisterSalesHistory;
let paymentCount: number;

function openSession(id: string, register = "r1", state = "OPEN"): void {
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state, closed_at)
     VALUES ('${id}', '${register}', 'device-1', 'u1', '2026-10-08T08:00:00.000Z', 0, '${state}', ${state === "OPEN" ? "NULL" : "'2026-10-08T20:00:00.000Z'"})`,
  );
}

function addSale({
  id,
  session = "open-session",
  register = "r1",
  state = "COMPLETED",
  occurredAt = "2026-10-08T12:00:00.000Z",
  operationNumber = null,
  actor = "u1",
  lines = [1000],
  payments,
  fiscal,
  deferred = false,
  offlineDocument,
}: SaleSeed): void {
  database
    .prepare(
      `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number, voided_at)
       VALUES (?, ?, 'device-1', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      register,
      session,
      actor,
      state,
      occurredAt,
      operationNumber,
      state === "VOIDED" ? occurredAt : null,
    );
  lines.forEach((lineTotal, index) => {
    database
      .prepare(
        `INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total)
         VALUES (?, ?, ?, ?, 'Producto', 1, ?, 'list-1', 0, ?)`,
      )
      .run(`${id}-line-${index}`, id, index + 1, `p-${index}`, lineTotal, lineTotal);
  });
  for (const payment of payments ?? [
    { method: "CASH" as const, amount: lines.reduce((a, b) => a + b, 0) },
  ]) {
    paymentCount += 1;
    const paymentId = `pay-${paymentCount}`;
    if (payment.method === "CASH") {
      database
        .prepare(
          `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
           VALUES (?, ?, 'SALE', 'CASH', 'NONE', ?, NULL, 'APPROVED', ?)`,
        )
        .run(paymentId, id, payment.amount, occurredAt);
    } else if (payment.method === "TRANSFER") {
      database
        .prepare(
          `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
           VALUES (?, ?, 'SALE', 'TRANSFER', 'NONE', ?, NULL, 'u1', ?, 'APPROVED', ?)`,
        )
        .run(paymentId, id, payment.amount, occurredAt, occurredAt);
    } else {
      database
        .prepare(
          `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
           VALUES (?, ?, 'SALE', 'QR', 'MERCADOPAGO_QR', ?, 'APPROVED', ?, ?)`,
        )
        .run(paymentId, id, payment.amount, occurredAt, occurredAt);
    }
  }
  if (fiscal !== undefined) {
    database
      .prepare(
        `INSERT INTO fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
           authorization_code, authorization_code_due_on, reserved_at, resolved_at
         ) VALUES (?, ?, ?, 'factura_c', ?, '2026-10-08', '{}', ?, ?, ?, '2026-10-08T12:00:00.000Z', ?)`,
      )
      .run(
        `doc-${id}`,
        id,
        fiscal.pointOfSale ?? 3,
        fiscal.number ?? paymentCount + 100,
        fiscal.state,
        fiscal.state === "AUTHORIZED" ? "75123456789012" : null,
        fiscal.state === "AUTHORIZED" ? "2026-10-18" : null,
        fiscal.state === "REQUESTING" ? null : "2026-10-08T12:00:01.000Z",
      );
  }
  if (offlineDocument !== undefined) {
    database
      .prepare(
        `INSERT INTO offline_fiscal_documents (
           id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
           offline_authorization_code, fortnight_start, fortnight_end, document,
           buyer_document_type, buyer_document_number, cause
         ) VALUES (
           ?, ?, ?, 'factura_c', ?, '2026-10-08', '2026-10-08T12:00:00.000Z', '20261008090000',
           '36251478963214', '2026-10-01', '2026-10-15', '{}', 99, 0, 'no_connectivity'
         )`,
      )
      .run(`offline-doc-${id}`, id, offlineDocument.pointOfSale, offlineDocument.number);
  }
  if (deferred) {
    database
      .prepare(
        `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
         VALUES (?, ?, '2026-10-08T12:00:00.000Z', 3000, 'fiscally_offline', ?, '2026-10-08T12:00:00.000Z')`,
      )
      .run(`deferred-${id}`, id, uniqueShortCode());
  }
  if (deferred === "cancelled") {
    database
      .prepare(
        "UPDATE deferred_sales SET cancelled_at = '2026-10-08T12:01:00.000Z' WHERE sale_id = ?",
      )
      .run(id);
  }
  if (deferred === "satisfied") {
    database
      .prepare(
        "UPDATE deferred_sales SET satisfied_by_fiscal_document_id = ?, satisfied_at = '2026-10-08T12:01:00.000Z' WHERE sale_id = ?",
      )
      .run(`doc-${id}`, id);
  }
}

function addCreditNote(saleId: string, answer: Record<string, string | number | null> = {}): void {
  database
    .prepare(
      `INSERT INTO sale_void_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on,
         authorization_code, authorization_code_due_on, recorded_at, answered_at
       ) VALUES (
         @id, @sale_id, 1000, 5, 11, 3, 41, @state, @point_of_sale, @number, @issued_on,
         @authorization_code, @authorization_code_due_on, '2026-10-08T12:30:00.000Z', @answered_at
       )`,
    )
    .run({
      id: `note-${saleId}`,
      sale_id: saleId,
      state: "IN_PROGRESS",
      point_of_sale: null,
      number: null,
      issued_on: null,
      authorization_code: null,
      authorization_code_due_on: null,
      answered_at: null,
      ...answer,
    });
}

function idsOf(page: { entries: { saleId: string }[] }): string[] {
  return page.entries.map(({ saleId }) => saleId);
}

function all(standing?: SaleStanding) {
  return history.salesOfRegister({ standing, offset: 0, limit: 100 });
}

beforeEach(() => {
  paymentCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Marta', 'cashier', 's', 1, 1);`,
  );
  openSession("open-session");
  openSession("old-session", "r1", "CLOSED");
  history = new SqliteRegisterSalesHistory(database);
});

afterEach(() => {
  database.close();
});

describe("SqliteRegisterSalesHistory", () => {
  describe("the listing", () => {
    it("lists the most recent sale first", () => {
      addSale({ id: "early", occurredAt: "2026-10-08T09:00:00.000Z" });
      addSale({ id: "late", occurredAt: "2026-10-08T15:00:00.000Z" });
      addSale({ id: "middle", occurredAt: "2026-10-08T12:00:00.000Z" });

      expect(idsOf(all())).toEqual(["late", "middle", "early"]);
    });

    it("orders sales of the same instant by the order they were recorded, latest first", () => {
      addSale({ id: "first" });
      addSale({ id: "second" });

      expect(idsOf(all())).toEqual(["second", "first"]);
    });

    it("pages the sales and counts every sale that matches, not only the page", () => {
      for (let n = 1; n <= 7; n += 1) {
        addSale({ id: `sale-${n}`, occurredAt: `2026-10-08T12:0${n}:00.000Z` });
      }

      const second = history.salesOfRegister({ standing: undefined, offset: 3, limit: 3 });

      expect(idsOf(second)).toEqual(["sale-4", "sale-3", "sale-2"]);
      expect(second.total).toBe(7);
    });

    it("lists only the completed and voided sales of this register", () => {
      openSession("other-session", "r2");
      addSale({ id: "mine" });
      addSale({ id: "in-progress-cart", state: "OPEN", occurredAt: null, lines: [], payments: [] });
      addSale({ id: "cancelled", state: "CANCELLED" });
      addSale({ id: "voided", state: "VOIDED" });
      addSale({ id: "another-registers", session: "other-session", register: "r2" });

      const page = all();

      expect(idsOf(page)).toEqual(["voided", "mine"]);
      expect(page.total).toBe(2);
    });

    it("lists the sales of the open session only, or of every session of the register", () => {
      addSale({ id: "today", session: "open-session", occurredAt: "2026-10-08T12:00:00.000Z" });
      addSale({ id: "yesterday", session: "old-session", occurredAt: "2026-10-07T12:00:00.000Z" });

      const open = history.salesOfOpenSession({ standing: undefined, offset: 0, limit: 50 });

      expect(idsOf(open)).toEqual(["today"]);
      expect(open.total).toBe(1);
      expect(idsOf(all())).toEqual(["today", "yesterday"]);
    });

    it("lists nothing for the open session when the register has none open", () => {
      database.exec(
        "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-10-08T20:00:00.000Z'",
      );
      addSale({ id: "closed-day" });

      expect(history.salesOfOpenSession({ standing: undefined, offset: 0, limit: 50 })).toEqual({
        entries: [],
        total: 0,
      });
    });

    it("shows the sale's time, operation number, total and payment methods", () => {
      addSale({
        id: "sale-1",
        occurredAt: "2026-10-08T12:34:00.000Z",
        operationNumber: 482,
        lines: [1500, 2500],
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "TRANSFER", amount: 3000 },
        ],
      });

      expect(all().entries).toEqual([
        {
          saleId: "sale-1",
          occurredAt: new Date("2026-10-08T12:34:00.000Z"),
          operationNumber: 482,
          paymentMethods: ["CASH", "TRANSFER"],
          total: 4000,
          fiscal: { deferred: false, fiscalDocument: null },
          voided: false,
        },
      ]);
    });

    it("shows no operation number for a sale completed before they were kept", () => {
      addSale({ id: "old", operationNumber: null });

      expect(all().entries[0]?.operationNumber).toBeNull();
    });

    it("names a Mercado Pago QR payment among the payment methods", () => {
      addSale({
        id: "sale-1",
        lines: [4000],
        payments: [
          { method: "QR", amount: 3000 },
          { method: "CASH", amount: 1000 },
        ],
      });

      expect(all().entries[0]?.paymentMethods).toEqual(["QR", "CASH"]);
    });

    it.each(["PENDING", "DECLINED", "EXPIRED"])(
      "leaves out the method of a payment that is %s, as the detail does",
      (state) => {
        addSale({ id: "sale-1", lines: [1000], payments: [{ method: "CASH", amount: 1000 }] });
        database
          .prepare(
            `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
             VALUES ('qr-1', 'sale-1', 'SALE', 'QR', 'MERCADOPAGO_QR', 1000, ?, '2026-10-08T11:59:00.000Z', '2026-10-08T12:02:00.000Z')`,
          )
          .run(state);

        expect(all().entries[0]?.paymentMethods).toEqual(["CASH"]);
      },
    );

    it("names a payment method once however many payments used it", () => {
      addSale({
        id: "sale-1",
        lines: [3000],
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "CASH", amount: 1000 },
          { method: "CASH", amount: 1000 },
        ],
      });

      expect(all().entries[0]?.paymentMethods).toEqual(["CASH"]);
    });

    it("shows the authorized fiscal document's type, point of sale and number", () => {
      addSale({ id: "sale-1", fiscal: { state: "AUTHORIZED", pointOfSale: 7, number: 1204 } });

      expect(all().entries[0]?.fiscal).toEqual({
        deferred: false,
        fiscalDocument: {
          state: "AUTHORIZED",
          documentType: "factura_c",
          pointOfSale: 7,
          number: 1204,
        },
      });
    });

    it("shows the document issued under a pre-obtained code as its fiscal document", () => {
      addSale({ id: "sale-1", offlineDocument: { pointOfSale: 8, number: 412 } });

      expect(all().entries[0]?.fiscal).toEqual({
        deferred: false,
        fiscalDocument: {
          state: "AUTHORIZED",
          documentType: "factura_c",
          pointOfSale: 8,
          number: 412,
        },
      });
    });

    it("shows a voided sale as voided", () => {
      addSale({ id: "sale-1", state: "VOIDED" });

      expect(all().entries[0]?.voided).toBe(true);
    });

    it("shows a deferred sale whose record was cancelled as no longer deferred", () => {
      addSale({ id: "sale-1", state: "VOIDED", deferred: "cancelled" });

      expect(all().entries[0]?.fiscal).toEqual({ deferred: false, fiscalDocument: null });
    });

    it("shows that a sale was deferred", () => {
      addSale({ id: "sale-1", deferred: true });

      expect(all().entries[0]?.fiscal).toEqual({ deferred: true, fiscalDocument: null });
    });
  });

  describe("a deferred sale an authorization satisfied", () => {
    beforeEach(() => {
      addSale({
        id: "adopted",
        occurredAt: "2026-10-08T10:00:00.000Z",
        fiscal: { state: "AUTHORIZED", pointOfSale: 7, number: 1204 },
        deferred: "satisfied",
      });
      addSale({
        id: "released",
        occurredAt: "2026-10-08T10:01:00.000Z",
        fiscal: { state: "RELEASED", pointOfSale: 8 },
        deferred: true,
      });
      addSale({
        id: "conflicting",
        occurredAt: "2026-10-08T10:02:00.000Z",
        fiscal: { state: "CONFLICTING", pointOfSale: 9 },
        deferred: true,
      });
    });

    it("shows its authorized document as its fiscal document, no longer deferred", () => {
      const adopted = all().entries.find(({ saleId }) => saleId === "adopted");

      expect(adopted?.fiscal).toEqual({
        deferred: false,
        fiscalDocument: {
          state: "AUTHORIZED",
          documentType: "factura_c",
          pointOfSale: 7,
          number: 1204,
        },
      });
    });

    it("is completed, while a sale whose document was released or conflicting stays deferred", () => {
      expect(idsOf(all("completed"))).toEqual(["adopted"]);
      expect(idsOf(all("deferred"))).toEqual(["conflicting", "released"]);
    });
  });

  describe("filtering by standing", () => {
    beforeEach(() => {
      addSale({ id: "no-document", occurredAt: "2026-10-08T10:00:00.000Z" });
      addSale({
        id: "authorized",
        occurredAt: "2026-10-08T10:01:00.000Z",
        fiscal: { state: "AUTHORIZED" },
      });
      addSale({
        id: "requesting",
        occurredAt: "2026-10-08T10:02:00.000Z",
        fiscal: { state: "REQUESTING" },
      });
      addSale({ id: "offline", occurredAt: "2026-10-08T10:03:00.000Z", deferred: true });
      addSale({
        id: "rejected",
        occurredAt: "2026-10-08T10:04:00.000Z",
        fiscal: { state: "REJECTED" },
        deferred: true,
      });
      addSale({
        id: "unknown",
        occurredAt: "2026-10-08T10:05:00.000Z",
        fiscal: { state: "UNKNOWN", pointOfSale: 4 },
        deferred: true,
      });
      addSale({
        id: "voided-unbilled",
        occurredAt: "2026-10-08T10:06:00.000Z",
        state: "VOIDED",
        deferred: "cancelled",
      });
      addSale({
        id: "voided-authorized",
        occurredAt: "2026-10-08T10:07:00.000Z",
        state: "VOIDED",
        fiscal: { state: "AUTHORIZED" },
      });
    });

    it("lists every standing when none is asked", () => {
      expect(all().total).toBe(8);
    });

    it("lists the voided sales, whatever their fiscal facts", () => {
      const page = all("voided");

      expect(idsOf(page)).toEqual(["voided-authorized", "voided-unbilled"]);
      expect(page.total).toBe(2);
    });

    it("lists the completed sales", () => {
      const page = all("completed");

      expect(idsOf(page)).toEqual(["authorized", "no-document"]);
      expect(page.total).toBe(2);
    });

    it("lists the sales whose fiscal document is being requested", () => {
      const page = all("in_progress");

      expect(idsOf(page)).toEqual(["requesting"]);
      expect(page.total).toBe(1);
    });

    it("lists the deferred sales, including those whose document was rejected or left unknown", () => {
      const page = all("deferred");

      expect(idsOf(page)).toEqual(["unknown", "rejected", "offline"]);
      expect(page.total).toBe(3);
    });

    it("counts the total of the standing asked, whatever the page", () => {
      const page = history.salesOfRegister({ standing: "deferred", offset: 0, limit: 1 });

      expect(idsOf(page)).toEqual(["unknown"]);
      expect(page.total).toBe(3);
    });

    it("filters the open session's sales by standing too", () => {
      addSale({ id: "closed-session-deferred", session: "old-session", deferred: true });

      const page = history.salesOfOpenSession({ standing: "deferred", offset: 0, limit: 50 });

      expect(page.total).toBe(3);
    });

    it.each(DECIDED_STANDINGS)(
      "lists under %s exactly the sales the domain gives that standing",
      (standing) => {
        const expected = all()
          .entries.filter(
            ({ fiscal, voided }) => saleStandingOf({ ...fiscal, voided }) === standing,
          )
          .map(({ saleId }) => saleId);

        expect(idsOf(all(standing))).toEqual(expected);
      },
    );
  });

  describe("a sale with a discount on its total", () => {
    function discountSale(id: string, amount: number): void {
      database
        .prepare(
          `UPDATE sales SET sale_discount_kind = 'AMOUNT', sale_discount_value = ?,
             sale_discount_reason = 'Cliente frecuente'
           WHERE id = ?`,
        )
        .run(amount, id);
    }

    it("totals what was charged in the listing and in its detail", () => {
      addSale({ id: "sale-1", lines: [1500, 2500] });
      discountSale("sale-1", 500);

      expect(all().entries.map(({ total }) => total)).toEqual([3500]);
      expect(history.saleOfRegister("sale-1")?.total).toBe(3500);
    });
  });

  describe("the detail of one sale", () => {
    it("shows who served it, its lines, its payments and its fiscal facts", () => {
      addSale({
        id: "sale-1",
        occurredAt: "2026-10-08T12:34:00.000Z",
        operationNumber: 482,
        lines: [1500, 2500, 500],
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "TRANSFER", amount: 3500 },
        ],
        fiscal: { state: "AUTHORIZED", pointOfSale: 7, number: 1204 },
      });

      expect(history.saleOfRegister("sale-1")).toEqual({
        saleId: "sale-1",
        occurredAt: new Date("2026-10-08T12:34:00.000Z"),
        operationNumber: 482,
        servedByFirstName: "Marta",
        lineCount: 3,
        total: 4500,
        payments: [
          { method: "CASH", amount: 1000 },
          { method: "TRANSFER", amount: 3500 },
        ],
        fiscal: {
          deferred: false,
          fiscalDocument: {
            state: "AUTHORIZED",
            documentType: "factura_c",
            pointOfSale: 7,
            number: 1204,
          },
        },
        voided: false,
        inOpenSession: true,
        creditNote: null,
      });
    });

    it("shows a Mercado Pago QR payment of the sale with its amount", () => {
      addSale({ id: "sale-1", lines: [3070], payments: [{ method: "QR", amount: 3070 }] });

      expect(history.saleOfRegister("sale-1")?.payments).toEqual([{ method: "QR", amount: 3070 }]);
    });

    it("finds a sale of a closed session, outside the open session", () => {
      addSale({ id: "old", session: "old-session" });

      expect(history.saleOfRegister("old")).toMatchObject({ saleId: "old", inOpenSession: false });
    });

    it("finds a voided sale and says so", () => {
      addSale({ id: "gone", state: "VOIDED" });

      expect(history.saleOfRegister("gone")).toMatchObject({ saleId: "gone", voided: true });
    });

    it("does not find a sale that does not exist, was cancelled or belongs to another register", () => {
      openSession("other-session", "r2");
      addSale({ id: "cancelled", state: "CANCELLED" });
      addSale({ id: "another-registers", session: "other-session", register: "r2" });

      expect(history.saleOfRegister("missing")).toBeUndefined();
      expect(history.saleOfRegister("cancelled")).toBeUndefined();
      expect(history.saleOfRegister("another-registers")).toBeUndefined();
    });

    it("shows no credit note for a sale that has none", () => {
      addSale({ id: "plain" });

      expect(history.saleOfRegister("plain")?.creditNote).toBeNull();
    });

    it("shows the credit note of a voided sale in progress", () => {
      addSale({ id: "gone", state: "VOIDED" });
      addCreditNote("gone");

      expect(history.saleOfRegister("gone")?.creditNote).toEqual({ kind: "in_progress" });
    });

    it("shows the authorization of the credit note of a voided sale", () => {
      addSale({ id: "gone", state: "VOIDED" });
      addCreditNote("gone", {
        state: "AUTHORIZED",
        point_of_sale: 3,
        number: 7,
        issued_on: "2026-10-08",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-18",
        answered_at: "2026-10-08T12:31:00.000Z",
      });

      expect(history.saleOfRegister("gone")?.creditNote).toEqual({
        kind: "authorized",
        pointOfSale: 3,
        number: 7,
        issuedOn: "2026-10-08",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-18",
      });
    });

    it("shows that the invoice of a voided sale already had a credit note", () => {
      addSale({ id: "gone", state: "VOIDED" });
      addCreditNote("gone", {
        state: "ALREADY_CREDITED",
        answered_at: "2026-10-08T12:31:00.000Z",
      });

      expect(history.saleOfRegister("gone")?.creditNote).toEqual({ kind: "already_credited" });
    });

    it("shows the rejection of the credit note of a voided sale", () => {
      addSale({ id: "gone", state: "VOIDED" });
      addCreditNote("gone", { state: "REJECTED", answered_at: "2026-10-08T12:31:00.000Z" });

      expect(history.saleOfRegister("gone")?.creditNote).toEqual({ kind: "rejected" });
    });
  });

  describe("the evidence that the register is fiscally online", () => {
    it("is that of the latest health check", () => {
      database.exec(
        `INSERT INTO register_health_checks (checked_at, round_trip_ms, token_valid, arca_reachable)
         VALUES ('2026-10-08T12:00:00.000Z', 100, 0, 0), ('2026-10-08T12:00:05.000Z', 100, 1, 1)`,
      );

      expect(history.fiscalOnlineEvidence()).toEqual({
        lastHealthCheckOkAt: new Date("2026-10-08T12:00:05.000Z"),
        tokenValid: true,
        arcaReachable: true,
      });
    });

    it("is none while the register never checked its health", () => {
      expect(history.fiscalOnlineEvidence()).toEqual({
        lastHealthCheckOkAt: null,
        tokenValid: false,
        arcaReachable: false,
      });
    });
  });
});
