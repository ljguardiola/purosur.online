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
  insertVoidedSale,
} from "../sales/test-support/credit-note-receipt-database";
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

    it("backs up nothing when it has no authorized credit note", async () => {
      await record("sale_void", "sale-1");

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
