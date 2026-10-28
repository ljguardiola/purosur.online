import type { ContingencyBackupOperation } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  insertCompletedSale,
  insertDeferredSale,
  insertOfflineFiscalDocument,
  openFiscalDatabase,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import {
  insertCreditNote,
  insertCreditNoteIssuedOffline,
  insertVoidedSale,
} from "../sales/test-support/credit-note-receipt-database";
import {
  insertBranchSettings,
  insertStoredRefund,
  insertStoredReturn,
  openSoldSaleDatabase,
} from "../returns/test-support/sold-sale-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import {
  CHAIN_KEY,
  openOutboxDatabase,
  outboxEventDraft,
} from "../sync/test-support/sqlite-local-outbox";
import { readContingencyBackupTicketPrintout } from "./sqlite-contingency-backup-ticket-printout";
import { SqliteContingencyBackupTickets } from "./sqlite-contingency-backup-tickets";

const CREATED_AT = new Date("2026-10-09T15:07:00.000Z");

let database: LocalDatabase;

function addBranch(): void {
  database.exec(
    `INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1)`,
  );
}

async function record(
  operation: ContingencyBackupOperation,
  subjectId: string | null,
  sealed: { keyVersion: number; qrCodes: string[] } | null = {
    keyVersion: 1,
    qrCodes: ["QR-A", "QR-B"],
  },
): Promise<void> {
  await new SqliteContingencyBackupTickets(database).transaction((tx) =>
    tx.recordTicket({
      id: "ticket-1",
      operation,
      subjectId,
      range: { firstDeviceSeq: 1, lastDeviceSeq: 2 },
      createdAt: CREATED_AT,
      sealed,
    }),
  );
}

function printout() {
  return readContingencyBackupTicketPrintout(database, "ticket-1");
}

describe("reading what a ticket prints", () => {
  describe("for a sale", () => {
    beforeEach(() => {
      database = openFiscalDatabase();
      addBranch();
      insertCompletedSale(database, "sale-1");
      database.prepare("UPDATE sales SET operation_number = 482 WHERE id = 'sale-1'").run();
    });

    afterEach(() => {
      database.close();
    });

    it("holds where and when, the sale's operation number and the QR texts", async () => {
      await record("sale", "sale-1");

      expect(printout()).toEqual({
        createdAt: CREATED_AT,
        branchAddress: "Av. Belgrano 1450",
        registerName: "Caja 1",
        operation: { kind: "numbered", operationNumber: 482 },
        backs: null,
        qrCodes: ["QR-A", "QR-B"],
      });
    });

    it("backs up the invoice issued offline for the sale", async () => {
      insertOfflineFiscalDocument(database, { saleId: "sale-1", pointOfSale: 31, number: 1234 });
      await record("sale", "sale-1");

      expect(printout()?.backs).toEqual({ kind: "invoice", pointOfSale: 31, number: 1234 });
    });

    it("backs up the non-fiscal document of a sale deferred until its invoice is issued", async () => {
      const { shortCode } = insertDeferredSale(database, "sale-1");
      await record("sale", "sale-1");

      expect(printout()?.backs).toEqual({ kind: "deferred_sale_document", shortCode });
    });

    it.each(["paid_sale_cancellation", "reprint"] as const)(
      "numbers the sale of a %s without a document to back up",
      async (operation) => {
        insertOfflineFiscalDocument(database, { saleId: "sale-1" });
        await record(operation, "sale-1");

        expect(printout()).toMatchObject({
          operation: { kind: "numbered", operationNumber: 482 },
          backs: null,
        });
      },
    );

    it("cannot be read for a sale without an operation number", async () => {
      database.prepare("UPDATE sales SET operation_number = NULL").run();
      await record("sale", "sale-1");

      expect(printout()).toBeUndefined();
    });

    it("cannot be read for a ticket that holds no QR text", async () => {
      await record("sale", "sale-1", null);

      expect(printout()).toBeUndefined();
    });

    it("cannot be read for a ticket the register does not hold", () => {
      expect(readContingencyBackupTicketPrintout(database, "missing")).toBeUndefined();
    });
  });

  describe("for the void of a sale", () => {
    beforeEach(() => {
      database = openOutboxDatabase();
      database.exec(
        "INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0)",
      );
      insertVoidedSale(database);
    });

    afterEach(() => {
      database.close();
    });

    it("backs up the credit note that was authorized for it", async () => {
      insertCreditNote(database);
      await record("sale_void", "sale-1");

      expect(printout()).toMatchObject({
        operation: { kind: "numbered", operationNumber: 482 },
        backs: { kind: "credit_note", pointOfSale: 12, number: 7 },
      });
    });

    it("backs up the credit note issued offline for it, under the offline point of sale and its own series", async () => {
      insertCreditNoteIssuedOffline(database, { pointOfSale: 31, number: 3 });
      await record("sale_void", "sale-1");

      expect(printout()).toMatchObject({
        operation: { kind: "numbered", operationNumber: 482 },
        backs: { kind: "credit_note", pointOfSale: 31, number: 3 },
      });
    });

    it("backs up nothing when it has no authorized credit note", async () => {
      await record("sale_void", "sale-1");

      expect(printout()?.backs).toBeNull();
    });
  });

  describe("for a return", () => {
    beforeEach(() => {
      database = openSoldSaleDatabase();
      insertBranchSettings(database, 15);
      database.prepare("UPDATE sales SET operation_number = 482 WHERE id = 'sale-1'").run();
      insertStoredReturn(database, "return-1", [
        { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
      ]);
      insertStoredRefund(database, {
        id: "refund-1",
        paymentId: "pay-cash",
        method: "CASH",
        amount: 1500,
      });
      insertStoredRefund(database, {
        id: "refund-2",
        paymentId: "pay-transfer",
        method: "TRANSFER",
        amount: 1000,
      });
      database
        .prepare("UPDATE payment_refunds SET return_id = 'return-1'")
        .run();
    });

    afterEach(() => {
      database.close();
    });

    function insertReturnCreditNote(state = "AUTHORIZED"): void {
      database
        .prepare(
          `INSERT INTO sale_credit_notes (
             id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
             corrected_voucher_type, corrected_point_of_sale, corrected_number, state,
             point_of_sale, number, issued_on, issued_at, authorization_code,
             authorization_code_due_on, recorded_at, answered_at
           ) VALUES (
             'note-r1', 'sale-1', 'return-1', '2026-09-20', 2500, 5, 11, 12, 41, @state,
             @point_of_sale, @number, @issued_on, @issued_at, @code,
             @due_on, '2026-09-20T12:00:00.000Z', '2026-09-20T12:00:02.000Z'
           )`,
        )
        .run({
          state,
          point_of_sale: state === "AUTHORIZED" ? 12 : null,
          number: state === "AUTHORIZED" ? 9 : null,
          code: state === "AUTHORIZED" ? "71234567890999" : null,
          issued_on: state === "AUTHORIZED" ? "2026-09-20" : null,
          issued_at: state === "AUTHORIZED" ? "2026-09-20T12:00:01.000Z" : null,
          due_on: state === "AUTHORIZED" ? "2026-09-30" : null,
        });
    }

    it("holds the original ticket's number and only the cash it refunded", async () => {
      await record("return", "return-1");

      expect(printout()).toMatchObject({
        operation: { kind: "return", originalOperationNumber: 482, cashRefunded: 1500 },
        backs: null,
      });
    });

    it("does not know the original ticket's number when the register holds none", async () => {
      database.prepare("UPDATE sales SET operation_number = NULL").run();
      await record("return", "return-1");

      expect(printout()?.operation).toEqual({
        kind: "return",
        originalOperationNumber: null,
        cashRefunded: 1500,
      });
    });

    it("refunds no cash when the return refunded none in cash", async () => {
      database.prepare("DELETE FROM payment_refunds WHERE method = 'CASH'").run();
      await record("return", "return-1");

      expect(printout()?.operation).toMatchObject({ cashRefunded: 0 });
    });

    it("does not count the cash refunded by another return or by a void", async () => {
      database.exec(
        `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at, return_id)
         VALUES ('refund-3', 'pay-cash', 'CASH', 'NONE', 700, 'APPROVED', '2026-09-21T12:00:00.000Z', NULL)`,
      );
      await record("return", "return-1");

      expect(printout()?.operation).toMatchObject({ cashRefunded: 1500 });
    });

    it("backs up the credit note the return issued", async () => {
      insertReturnCreditNote();
      await record("return", "return-1");

      expect(printout()?.backs).toEqual({ kind: "credit_note", pointOfSale: 12, number: 9 });
    });

    it("backs up nothing when the return has no authorized credit note", async () => {
      insertReturnCreditNote("REJECTED");
      await record("return", "return-1");

      expect(printout()?.backs).toBeNull();
    });
  });

  describe("for an operation without a sale", () => {
    beforeEach(() => {
      database = openOutboxDatabase();
      database.exec(
        "INSERT INTO own_register (id, name, version, removed) VALUES ('r1', 'Caja 1', 1, 0)",
      );
      addBranch();
    });

    afterEach(() => {
      database.close();
    });

    it.each([
      ["cash_session_opening", { kind: "cash_session_opening" }],
      ["cash_session_closing", { kind: "cash_session_closing" }],
      ["initial_count", { kind: "initial_count" }],
      ["clock_correction", { kind: "clock_correction" }],
    ] as const)("names a %s", async (operation, expected) => {
      await record(operation, null);

      expect(printout()).toMatchObject({ operation: expected, backs: null });
    });

    function appendEvent(eventType: string, payload: Record<string, string>): void {
      appendOutboxEvent(database, CHAIN_KEY, {
        ...outboxEventDraft(1),
        event_id: `018f0000-0000-7000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`,
        event_type: eventType,
        payload,
      });
    }

    it.each(["CASH_IN", "CASH_OUT", "WITHDRAWAL"] as const)(
      "carries the %s kind its own cash movement event holds",
      async (movement) => {
        appendEvent("cash_movement_recorded", { type: movement });
        appendEvent("cash_session_opened", { type: "OPENING" });
        await record("cash_movement", null);

        expect(printout()?.operation).toEqual({ kind: "cash_movement", movement });
      },
    );

    it("does not take the kind from a cash movement event outside the ticket's range", async () => {
      appendEvent("cash_session_opened", { type: "OPENING" });
      appendEvent("cash_session_opened", { type: "OPENING" });
      appendEvent("cash_movement_recorded", { type: "CASH_IN" });
      await record("cash_movement", null);

      expect(printout()?.operation).toEqual({ kind: "cash_movement", movement: null });
    });

    it("does not know the kind once the events are gone", async () => {
      await record("cash_movement", null);

      expect(printout()?.operation).toEqual({ kind: "cash_movement", movement: null });
    });

    it("does not know a kind it does not recognize", async () => {
      appendEvent("cash_movement_recorded", { type: "SALE" });
      await record("cash_movement", null);

      expect(printout()?.operation).toEqual({ kind: "cash_movement", movement: null });
    });
  });
});
