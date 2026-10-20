import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertFiscalDocument } from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { printCreditNoteFor, printVoidedSaleCreditNoteFor } from "./credit-note-receipt-requests";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import type { ReceiptRequestDeps } from "./receipt-requests";
import { ControllableReceiptPrinter } from "./test-support/controllable-receipt-printer";
import { insertCreditNote, insertVoidedSale } from "./test-support/credit-note-receipt-database";
import { printoutOf } from "./test-support/escpos-printout";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const NO_PRINTERS = { configured: () => undefined };

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let printer: ControllableReceiptPrinter;
let jobs: ReturnType<typeof createReceiptPrintJobs>;
let failures: unknown[];

function deps(overrides: Partial<ReceiptRequestDeps> = {}): ReceiptRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async () => "hash-of-a-pin",
      now: () => new Date("2026-09-30T16:00:00.000Z"),
    }),
    now: () => new Date("2026-09-30T16:00:00.000Z"),
    ids: { next: () => "id" },
    readOutboxChainKey: async () => undefined,
    signedInUserId: () => signedInPerson.userId(),
    printers: { configured: () => printer },
    jobs,
    ...overrides,
  };
}

function addPerson(id: string, permissions: string[]): void {
  database
    .prepare(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('role-${id}', 'Rol', 0, 1)`,
    )
    .run();
  for (const key of permissions) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(`role-${id}`, key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, ?, 1, 1)",
    )
    .run(id, id, `role-${id}`, encodePinHash(new Uint8Array(16).fill(1)));
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    "INSERT INTO own_register (id, name, version) VALUES ('r1', 'Caja 1', 1); UPDATE sync_state SET device_id = 'device-1';",
  );
  insertVoidedSale(database);
  insertFiscalDocument(database, { saleId: "sale-1", state: "AUTHORIZED", number: 41 });
  insertCreditNote(database);
  addPerson("clerk", ["view_sales_history"]);
  addPerson("cashier-without-history", ["sell_and_charge"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("clerk");
  printer = new ControllableReceiptPrinter();
  failures = [];
  jobs = createReceiptPrintJobs({ reportFailure: (_context, error) => failures.push(error) });
});

afterEach(() => {
  database.close();
});

describe("printing the credit note of a voided sale from its history", () => {
  it("hands the credit note to the printer once it reports ready, answering that it started", async () => {
    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({ kind: "started" });

    printer.becomeReady();

    expect(printer.handed).toHaveLength(1);
    const printout = printoutOf(printer.handed[0] ?? new Uint8Array());
    expect(printout.text).toContain("NOTA DE CRÉDITO C");
    expect(printout.text).toContain("Asociada a Factura C");
  });

  it("can be printed again, each time as the same credit note", async () => {
    await printCreditNoteFor(deps(), "sale-1");
    printer.becomeReady();
    await printCreditNoteFor(deps(), "sale-1");
    printer.becomeReady();

    expect(printer.handed).toHaveLength(2);
    expect(printer.handed[1]).toEqual(printer.handed[0]);
  });

  it("answers busy while the previous print of the credit note waits for the printer", async () => {
    await printCreditNoteFor(deps(), "sale-1");

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({ kind: "busy" });
  });

  it("records nothing: no print attempt, no reprint and no stored receipt of the sale", async () => {
    await printCreditNoteFor(deps(), "sale-1");
    printer.becomeReady();

    expect(database.prepare("SELECT print_attempted_at, printed_at FROM sales").get()).toEqual({
      print_attempted_at: null,
      printed_at: null,
    });
    expect(database.prepare("SELECT count(*) AS total FROM sale_reprints").get()).toEqual({
      total: 0,
    });
    expect(database.prepare("SELECT count(*) AS total FROM sale_receipts").get()).toEqual({
      total: 0,
    });
  });

  it("answers not_signed_in when nobody is signed in", async () => {
    signedInPerson.clear();

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({ kind: "not_signed_in" });
    expect(printer.waiting).toEqual([]);
  });

  it("answers lacks_permission to a person who may not view the sales history", async () => {
    signedInPerson.set("cashier-without-history");

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({
      kind: "lacks_permission",
    });
  });

  it("answers not_found for a sale without a credit note", async () => {
    await expect(printCreditNoteFor(deps(), "missing")).resolves.toEqual({ kind: "not_found" });
  });

  it.each(["IN_PROGRESS", "REJECTED", "ALREADY_CREDITED"])(
    "answers not_found while the credit note is %s: there is nothing to print",
    async (state) => {
      database.exec("DELETE FROM sale_void_credit_notes");
      insertCreditNote(database, {
        state,
        point_of_sale: null,
        number: null,
        issued_on: null,
        issued_at: null,
        authorization_code: null,
        authorization_code_due_on: null,
        answered_at: state === "IN_PROGRESS" ? null : "2026-09-30T15:40:05.000Z",
      });

      await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({ kind: "not_found" });
      expect(printer.waiting).toEqual([]);
    },
  );

  it("answers printer_not_configured when the register has no printer", async () => {
    await expect(printCreditNoteFor(deps({ printers: NO_PRINTERS }), "sale-1")).resolves.toEqual({
      kind: "printer_not_configured",
    });
  });

  it("answers unavailable, reporting the failure, when the credit note cannot be read", async () => {
    database.exec("DROP TABLE sale_void_credit_notes");

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({ kind: "unavailable" });
    expect(failures).toHaveLength(1);
  });
});

describe("printing the credit note right after the void", () => {
  it("hands it to the printer without asking anyone to be signed in", async () => {
    signedInPerson.clear();

    await printVoidedSaleCreditNoteFor(deps(), "sale-1");
    printer.becomeReady();

    expect(printer.handed).toHaveLength(1);
    expect(printoutOf(printer.handed[0] ?? new Uint8Array()).text).toContain("NOTA DE CRÉDITO C");
  });

  it("prints nothing for a credit note that is not authorized", async () => {
    database.exec("DELETE FROM sale_void_credit_notes");
    insertCreditNote(database, {
      state: "IN_PROGRESS",
      point_of_sale: null,
      number: null,
      issued_on: null,
      issued_at: null,
      authorization_code: null,
      authorization_code_due_on: null,
      answered_at: null,
    });

    await printVoidedSaleCreditNoteFor(deps(), "sale-1");

    expect(printer.waiting).toEqual([]);
  });

  it("does nothing when the register has no printer", async () => {
    await expect(
      printVoidedSaleCreditNoteFor(deps({ printers: NO_PRINTERS }), "sale-1"),
    ).resolves.toBeUndefined();
  });
});
