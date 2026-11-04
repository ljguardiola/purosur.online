import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContingencyBackupTicketRequests } from "../backups/contingency-backup-ticket-requests";
import { SqliteContingencyBackupTickets } from "../backups/sqlite-contingency-backup-tickets";
import { derivePinVerifier } from "../credentials/pin-verifier";
import {
  insertFiscalDocument,
  insertOfflineFiscalDocument,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { fixedZoneRulesSource } from "../platform/test-support/fixed-zone-rules-source";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import { answerReceiptQuestionFor, saleAsksBeforePrinting } from "./receipt-question-requests";
import { type ReceiptRequestDeps, receiptPrintStatusFor } from "./receipt-requests";
import { ControllableReceiptPrinter } from "./test-support/controllable-receipt-printer";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const COMPLETED_AT = "2026-10-08T11:59:00.000Z";
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let printer: ControllableReceiptPrinter;
let jobs: ReturnType<typeof createReceiptPrintJobs>;
let syncs: number;

function deps(): ReceiptRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async () => "hash-of-another-pin",
      now: () => NOW,
    }),
    now: () => NOW,
    ids: { next: () => "id-1" },
    readOutboxChainKey: async () => CHAIN_KEY,
    signedInUserId: () => signedInPerson.userId(),
    printers: { configured: () => printer },
    jobs,
    ticketedSteps: (_operation, _subjectId, operate) => operate((step) => step()),
    zoneRules: fixedZoneRulesSource(),
  };
}

function addSale(saleId: string, { withVoucher }: { withVoucher: boolean }): void {
  database.exec(
    `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, operation_number)
     VALUES ('${saleId}', 'r1', 'device-1', 's1', 'cashier', 'COMPLETED', '${COMPLETED_AT}', (SELECT 482 + count(*) FROM sales));
     INSERT INTO sale_lines (id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, promotion_id, discount_amount, line_total)
     VALUES ('line-${saleId}', '${saleId}', 1, 'p1', 'Yerba', 2, 1500, 'list-1', NULL, 0, 3000);
     INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at)
     VALUES ('pay-${saleId}', '${saleId}', 'SALE', 'CASH', 'NONE', 3000, 3000, NULL, NULL, 'APPROVED', '${COMPLETED_AT}');`,
  );
  if (withVoucher) {
    insertFiscalDocument(database, { saleId, id: `doc-${saleId}`, state: "AUTHORIZED" });
  }
}

function declinedAt(saleId: string): unknown {
  return database
    .prepare("SELECT print_declined_at, print_attempted_at FROM sales WHERE id = ?")
    .get(saleId);
}

function answer(saleId: string, print: boolean) {
  return answerReceiptQuestionFor(deps(), () => syncNow(), { saleId, print });
}

function syncNow(): void {
  syncs += 1;
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO branch_settings (location_id, address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version)
     VALUES ('location-1', 'Av. Belgrano 1450', '11 5555-0100', '@puro.sur', '{}', 30, 30, 15, 1);
     INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-cashier', 'Cajera', 0, 1);
     INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('role-cashier', 'sell_and_charge', 1);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('s1', 'r1', 'device-1', 'cashier', '2026-10-08T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO products (id, name, category_id, sale_unit, active, version)
     VALUES ('p1', 'Yerba del catalogo', 'c', 'UNIT', 1, 1);`,
  );
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('cashier', 'Ada', 'role-cashier', ?, 1, 1)",
    )
    .run(encodePinHash(new Uint8Array(16).fill(1)));
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES ('cashier', ?)")
    .run(derivePinVerifier(PEPPER, PIN_HASH));
  addSale("sale-1", { withVoucher: true });
  signedInPerson = createSignedInPerson();
  signedInPerson.set("cashier");
  printer = new ControllableReceiptPrinter();
  jobs = createReceiptPrintJobs({ reportFailure: () => {} });
  syncs = 0;
});

afterEach(() => {
  database.close();
});

describe("whether a sale's receipt asks before printing", () => {
  it("asks for a sale with a factura C that was never sent to the printer", () => {
    expect(saleAsksBeforePrinting(deps(), "sale-1")).toBe(true);
  });

  it("does not ask for a sale without a voucher", () => {
    addSale("sale-2", { withVoucher: false });

    expect(saleAsksBeforePrinting(deps(), "sale-2")).toBe(false);
  });

  it("does not ask once the cashier declined it", () => {
    database
      .prepare("UPDATE sales SET print_declined_at = ? WHERE id = 'sale-1'")
      .run(COMPLETED_AT);

    expect(saleAsksBeforePrinting(deps(), "sale-1")).toBe(false);
  });

  it("does not ask once its print was attempted", () => {
    database
      .prepare("UPDATE sales SET print_attempted_at = ? WHERE id = 'sale-1'")
      .run(COMPLETED_AT);

    expect(saleAsksBeforePrinting(deps(), "sale-1")).toBe(false);
  });

  it("does not ask for a sale the register does not hold", () => {
    expect(saleAsksBeforePrinting(deps(), "missing")).toBe(false);
  });
});

describe("a sale whose factura C was authorized in contingency", () => {
  const tickets = () => new SqliteContingencyBackupTickets(database);

  function backupTicketOfSale(saleId: string) {
    return createContingencyBackupTicketRequests({
      tickets: tickets(),
      clock: { now: () => NOW },
      printerFailure: () => null,
      signedInUserId: () => signedInPerson.userId(),
      gate: {
        run: async (_operation, perform) => ({
          kind: "performed",
          result: await perform({ signedInUserId: "cashier" }),
        }),
      },
    }).ofSale(saleId);
  }

  beforeEach(async () => {
    addSale("sale-3", { withVoucher: false });
    insertOfflineFiscalDocument(database, { saleId: "sale-3", id: "offline-doc-3" });
    await tickets().transaction((tx) =>
      tx.recordTicket({
        id: "backup-3",
        operation: "sale",
        subjectId: "sale-3",
        range: { firstDeviceSeq: 1, lastDeviceSeq: 1 },
        createdAt: NOW,
        sealed: { keyVersion: 1, qrCodes: ["AB"] },
      }),
    );
  });

  it("asks before printing its customer's factura C, while its backup ticket waits for it", async () => {
    expect(saleAsksBeforePrinting(deps(), "sale-3")).toBe(true);
    expect(await backupTicketOfSale("sale-3")).toEqual({
      kind: "read",
      ticket: { standing: "awaiting_customer_document" },
    });
  });

  it("leaves its backup ticket to print once the cashier says no", async () => {
    jobs.holdForAnswer("sale-3");

    expect(await answer("sale-3", false)).toEqual({ kind: "declined" });

    expect(printer.waiting).toEqual([]);
    expect(await backupTicketOfSale("sale-3")).toEqual({
      kind: "read",
      ticket: { standing: "to_print" },
    });
  });
});

describe("answering the question of a held sale", () => {
  it("answers not_signed_in when nobody is signed in", async () => {
    jobs.holdForAnswer("sale-1");
    signedInPerson.clear();

    expect(await answer("sale-1", true)).toEqual({ kind: "not_signed_in" });
    expect(jobs.isHeldForAnswer("sale-1")).toBe(true);
  });

  it("answers not_awaiting for a sale no question is held for, printing nothing", async () => {
    expect(await answer("sale-1", true)).toEqual({ kind: "not_awaiting" });
    expect(await answer("sale-1", false)).toEqual({ kind: "not_awaiting" });
    expect(printer.waiting).toEqual([]);
    expect(declinedAt("sale-1")).toEqual({ print_declined_at: null, print_attempted_at: null });
  });

  it("prints the original and releases the question when the cashier says yes", async () => {
    jobs.holdForAnswer("sale-1");

    expect(await answer("sale-1", true)).toEqual({ kind: "printing" });

    expect(jobs.isHeldForAnswer("sale-1")).toBe(false);
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("sale-1")).toBe("printed"));
    expect(printer.handed).toHaveLength(1);
    await vi.waitFor(() => expect(syncs).toBe(1));
  });

  it("records the decline, prints nothing, releases the question and syncs when the cashier says no", async () => {
    jobs.holdForAnswer("sale-1");

    expect(await answer("sale-1", false)).toEqual({ kind: "declined" });

    expect(jobs.isHeldForAnswer("sale-1")).toBe(false);
    expect(printer.waiting).toEqual([]);
    expect(printer.handed).toEqual([]);
    expect(declinedAt("sale-1")).toEqual({
      print_declined_at: NOW.toISOString(),
      print_attempted_at: null,
    });
    expect(syncs).toBe(1);
  });

  it("keeps the question held, recording no decline, when recording the decline fails", async () => {
    database.exec(
      `CREATE TRIGGER refuse_decline BEFORE UPDATE OF print_declined_at ON sales
       BEGIN SELECT RAISE(ABORT, 'disk unavailable'); END;`,
    );
    jobs.holdForAnswer("sale-1");

    await expect(answer("sale-1", false)).rejects.toThrow("disk unavailable");

    expect(jobs.isHeldForAnswer("sale-1")).toBe(true);
    expect(declinedAt("sale-1")).toEqual({ print_declined_at: null, print_attempted_at: null });
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      standing: "awaiting_answer",
    });
  });

  it("answers not_found, releasing the question, for a held sale the register does not hold", async () => {
    jobs.holdForAnswer("missing");

    expect(await answer("missing", false)).toEqual({ kind: "not_found" });
    expect(jobs.isHeldForAnswer("missing")).toBe(false);
  });

  it("answers not_awaiting and records no decline for a held sale whose receipt does not ask", async () => {
    addSale("sale-2", { withVoucher: false });
    jobs.holdForAnswer("sale-2");

    expect(await answer("sale-2", false)).toEqual({ kind: "not_awaiting" });
    expect(declinedAt("sale-2")).toEqual({ print_declined_at: null, print_attempted_at: null });
  });
});

describe("the print status of a sale held for the cashier's answer", () => {
  it("stands as preparing while the sale is prepared, before the core decided whether to ask", async () => {
    jobs.prepare("sale-1");

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "preparing",
    });
  });

  it("stands as awaiting_answer while the question is held", async () => {
    jobs.holdForAnswer("sale-1");

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "awaiting_answer",
    });
  });

  it("stands as declined once the cashier said no, and the next copy is still the original", async () => {
    jobs.holdForAnswer("sale-1");
    await answer("sale-1", false);

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "declined",
    });
  });
});
