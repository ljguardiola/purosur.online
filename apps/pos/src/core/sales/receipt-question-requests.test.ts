import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const OFFER_DEADLINE = new Date(NOW.getTime() + 3000);
const COMPLETED_AT = "2026-10-08T11:59:00.000Z";
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let printer: ControllableReceiptPrinter;
let jobs: ReturnType<typeof createReceiptPrintJobs>;
let syncs: number;
let moment: Date;

function deps(): ReceiptRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async () => "hash-of-another-pin",
      now: () => moment,
    }),
    now: () => moment,
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
  moment = NOW;
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
  beforeEach(() => {
    addSale("sale-3", { withVoucher: false });
    insertOfflineFiscalDocument(database, { saleId: "sale-3", id: "offline-doc-3" });
  });

  it("does not ask before printing its customer's factura C", () => {
    expect(saleAsksBeforePrinting(deps(), "sale-3")).toBe(false);
  });
});

describe("answering the question of a held sale", () => {
  it("answers not_signed_in when nobody is signed in", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    signedInPerson.clear();

    expect(await answer("sale-1", true)).toEqual({ kind: "not_signed_in" });
    expect(jobs.offerDeadlineOf("sale-1")).toEqual(OFFER_DEADLINE);
  });

  it("answers not_awaiting for a sale no question is held for, printing nothing", async () => {
    expect(await answer("sale-1", true)).toEqual({ kind: "not_awaiting" });
    expect(await answer("sale-1", false)).toEqual({ kind: "not_awaiting" });
    expect(printer.waiting).toEqual([]);
    expect(declinedAt("sale-1")).toEqual({ print_declined_at: null, print_attempted_at: null });
  });

  it("prints the original and releases the question when the cashier says yes", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);

    expect(await answer("sale-1", true)).toEqual({ kind: "printing" });

    expect(jobs.offerDeadlineOf("sale-1")).toBeUndefined();
    printer.becomeReady();
    await vi.waitFor(() => expect(jobs.standingOf("sale-1")).toBe("printed"));
    expect(printer.handed).toHaveLength(1);
    await vi.waitFor(() => expect(syncs).toBe(1));
  });

  it("records the decline, prints nothing, releases the question and syncs when the cashier says no", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);

    expect(await answer("sale-1", false)).toEqual({ kind: "declined" });

    expect(jobs.offerDeadlineOf("sale-1")).toBeUndefined();
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
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);

    await expect(answer("sale-1", false)).rejects.toThrow("disk unavailable");

    expect(jobs.offerDeadlineOf("sale-1")).toEqual(OFFER_DEADLINE);
    expect(declinedAt("sale-1")).toEqual({ print_declined_at: null, print_attempted_at: null });
    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      standing: "awaiting_answer",
    });
  });

  it("answers not_found, releasing the question, for a held sale the register does not hold", async () => {
    jobs.holdForAnswer("missing", OFFER_DEADLINE);

    expect(await answer("missing", false)).toEqual({ kind: "not_found" });
    expect(jobs.offerDeadlineOf("missing")).toBeUndefined();
  });

  it("answers not_awaiting and records no decline for a held sale whose receipt does not ask", async () => {
    addSale("sale-2", { withVoucher: false });
    jobs.holdForAnswer("sale-2", OFFER_DEADLINE);

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
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "awaiting_answer",
    });
  });

  it("stands as declined once the cashier said no, and the next copy is still the original", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    await answer("sale-1", false);

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      kind: "found",
      next_copy: { kind: "original" },
      printed: false,
      standing: "declined",
    });
  });
});

describe("the print offer lapsing", () => {
  it("stands as awaiting_answer with the time left and the offer's length right after the hold", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      standing: "awaiting_answer",
      offer: { remaining_ms: 3000, length_ms: 3000 },
    });
  });

  it("counts the time left down with the core's clock", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    moment = new Date(NOW.getTime() + 1200);

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      standing: "awaiting_answer",
      offer: { remaining_ms: 1800, length_ms: 3000 },
    });
  });

  it("carries no offer once the cashier answered", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    await answer("sale-1", false);

    expect(await receiptPrintStatusFor(deps(), "sale-1")).toMatchObject({
      standing: "declined",
      offer: null,
    });
  });

  it("stands as declined with no offer after the deadline, printing nothing, recording the decline, releasing the hold and syncing", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    moment = OFFER_DEADLINE;

    expect(await receiptPrintStatusFor(deps(), "sale-1", () => syncNow())).toMatchObject({
      standing: "declined",
      offer: null,
      printed: false,
    });

    expect(printer.waiting).toEqual([]);
    expect(printer.handed).toEqual([]);
    expect(declinedAt("sale-1")).toEqual({
      print_declined_at: OFFER_DEADLINE.toISOString(),
      print_attempted_at: null,
    });
    expect(jobs.offerDeadlineOf("sale-1")).toBeUndefined();
    expect(syncs).toBe(1);
  });

  it("answers lapsed, printing nothing, when the cashier says yes after the deadline", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    moment = new Date(OFFER_DEADLINE.getTime() + 1);

    expect(await answer("sale-1", true)).toEqual({ kind: "lapsed" });

    expect(printer.waiting).toEqual([]);
    expect(printer.handed).toEqual([]);
    expect(jobs.offerDeadlineOf("sale-1")).toBeUndefined();
    expect(declinedAt("sale-1")).toEqual({
      print_declined_at: moment.toISOString(),
      print_attempted_at: null,
    });
  });

  it("answers lapsed when the cashier says no after the deadline", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    moment = new Date(OFFER_DEADLINE.getTime() + 1);

    expect(await answer("sale-1", false)).toEqual({ kind: "lapsed" });
  });

  it("still prints when the cashier says yes just before the deadline", async () => {
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    moment = new Date(OFFER_DEADLINE.getTime() - 1);

    expect(await answer("sale-1", true)).toEqual({ kind: "printing" });
  });

  it("re-holds the question with the same deadline when recording the decline fails", async () => {
    database.exec(
      `CREATE TRIGGER refuse_decline BEFORE UPDATE OF print_declined_at ON sales
       BEGIN SELECT RAISE(ABORT, 'disk unavailable'); END;`,
    );
    jobs.holdForAnswer("sale-1", OFFER_DEADLINE);
    moment = new Date(NOW.getTime() + 500);

    await expect(answer("sale-1", false)).rejects.toThrow("disk unavailable");

    expect(jobs.offerDeadlineOf("sale-1")).toEqual(OFFER_DEADLINE);
  });
});
