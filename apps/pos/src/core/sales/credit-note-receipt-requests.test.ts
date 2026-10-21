import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import { insertFiscalDocument } from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  printCreditNoteFor,
  printVoidedSaleCreditNoteFor,
  reprintCreditNoteFor,
} from "./credit-note-receipt-requests";
import { createReceiptPrintJobs } from "./receipt-print-jobs";
import type { ReceiptRequestDeps } from "./receipt-requests";
import { ControllableReceiptPrinter } from "./test-support/controllable-receipt-printer";
import { insertCreditNote, insertVoidedSale } from "./test-support/credit-note-receipt-database";
import { printoutOf } from "./test-support/escpos-printout";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const PIN_HASH = "argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaC1vZi10aGUtcGlu";
const AUTHORIZER_PIN = "1234";
const REASON = "el cliente la perdió";
const NO_PRINTERS = { configured: () => undefined };

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let printer: ControllableReceiptPrinter;
let jobs: ReturnType<typeof createReceiptPrintJobs>;
let failures: unknown[];
let idCount: number;

function deps(overrides: Partial<ReceiptRequestDeps> = {}): ReceiptRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async (pin) => (pin === AUTHORIZER_PIN ? PIN_HASH : "hash-of-another-pin"),
      now: () => new Date("2026-09-30T16:00:00.000Z"),
    }),
    now: () => new Date("2026-09-30T16:00:00.000Z"),
    ids: {
      next: () => {
        idCount += 1;
        return `id-${idCount}`;
      },
    },
    readOutboxChainKey: async () => CHAIN_KEY,
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
  database
    .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
    .run(id, derivePinVerifier(PEPPER, PIN_HASH));
}

function creditNotePrinting(): unknown {
  return database.prepare("SELECT print_attempted_at, printed_at FROM credit_note_prints").get();
}

function creditNoteReprints(): unknown[] {
  return database
    .prepare(
      "SELECT document, order_number, requested_by, authorized_by, reason_kind, reason_text FROM sale_reprints ORDER BY order_number",
    )
    .all();
}

function outboxEvents(): { event_type: string; schema_version: number; payload: unknown }[] {
  return database
    .prepare<[], { event_type: string; schema_version: number; payload: string }>(
      "SELECT event_type, schema_version, payload FROM outbox ORDER BY device_seq",
    )
    .all()
    .map(({ payload, ...event }) => ({ ...event, payload: JSON.parse(payload) }));
}

async function printedOnce(): Promise<void> {
  await printCreditNoteFor(deps(), "sale-1");
  printer.becomeReady();
  await vi.waitFor(() =>
    expect(creditNotePrinting()).toMatchObject({ printed_at: expect.any(String) }),
  );
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
  addPerson("supervisor", ["reprint_receipt"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("clerk");
  printer = new ControllableReceiptPrinter();
  failures = [];
  idCount = 0;
  jobs = createReceiptPrintJobs({ reportFailure: (_context, error) => failures.push(error) });
});

afterEach(() => {
  database.close();
});

describe("printing the credit note of a voided sale from its history", () => {
  it("hands the original to the printer once it reports ready, answering the copy that started", async () => {
    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({
      kind: "started",
      copy: { kind: "original" },
    });

    printer.becomeReady();

    expect(printer.handed).toHaveLength(1);
    const printout = printoutOf(printer.handed[0] ?? new Uint8Array());
    expect(printout.text).toContain("NOTA DE CRÉDITO C");
    expect(printout.text).toContain("Asociada a Factura C");
    expect(printout.text).not.toContain("COPIA DUPLICADA");
  });

  it("records the attempt as it sends and the print and its event once the printer took it, asking no reason", async () => {
    await printCreditNoteFor(deps(), "sale-1");
    printer.becomeReady();
    await vi.waitFor(() => expect(outboxEvents()).toHaveLength(1));

    expect(creditNotePrinting()).toEqual({
      print_attempted_at: "2026-09-30T16:00:00.000Z",
      printed_at: "2026-09-30T16:00:00.000Z",
    });
    expect(outboxEvents()).toEqual([
      {
        event_type: "sale_print_state_changed",
        schema_version: 2,
        payload: {
          sale_id: "sale-1",
          document: "credit_note",
          print_attempted_at: "2026-09-30T16:00:00.000Z",
          printed_at: "2026-09-30T16:00:00.000Z",
        },
      },
    ]);
    expect(creditNoteReprints()).toEqual([]);
    expect(database.prepare("SELECT count(*) AS total FROM credit_note_receipts").get()).toEqual({
      total: 1,
    });
  });

  it("leaves the print state and the stored receipt of the sale untouched", async () => {
    await printedOnce();

    expect(database.prepare("SELECT print_attempted_at, printed_at FROM sales").get()).toEqual({
      print_attempted_at: null,
      printed_at: null,
    });
    expect(database.prepare("SELECT count(*) AS total FROM sale_receipts").get()).toEqual({
      total: 0,
    });
  });

  it("refuses a second original: once attempted, the history only reprints it as a duplicate", async () => {
    await printedOnce();

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({
      kind: "already_attempted",
    });
    expect(printer.waiting).toHaveLength(1);
  });

  it("answers busy while the previous print of the credit note waits for the printer", async () => {
    await printCreditNoteFor(deps(), "sale-1");

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({ kind: "busy" });
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

  it("answers unavailable, printing nothing, when the outbox is not ready", async () => {
    await expect(
      printCreditNoteFor(deps({ readOutboxChainKey: async () => undefined }), "sale-1"),
    ).resolves.toEqual({ kind: "unavailable" });
    expect(printer.waiting).toEqual([]);
  });

  it("answers unavailable, reporting the failure, when the credit note cannot be read", async () => {
    database.exec("DROP TABLE sale_void_credit_notes");

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({ kind: "unavailable" });
    expect(failures).toHaveLength(1);
  });
});

describe("reprinting the credit note of a voided sale from its history", () => {
  it("prints the credit note as the original, with no reprint recorded, when it was never printed", async () => {
    signedInPerson.set("supervisor");

    await expect(
      reprintCreditNoteFor(deps(), { saleId: "sale-1", reason: REASON }),
    ).resolves.toEqual({ kind: "started", copy: { kind: "original" } });
    printer.becomeReady();

    expect(creditNoteReprints()).toEqual([]);
    expect(printoutOf(printer.handed[0] ?? new Uint8Array()).text).not.toContain("COPIA DUPLICADA");
  });

  it("prints the same credit note as the numbered duplicate and records the reprint for a person holding the permission", async () => {
    await printedOnce();
    signedInPerson.set("supervisor");

    const outcome = await reprintCreditNoteFor(deps(), {
      saleId: "sale-1",
      reason: `  ${REASON} `,
    });
    await printer.whenWaiting(2);
    printer.becomeReady();

    expect(outcome).toEqual({ kind: "started", copy: { kind: "duplicate", order_number: 1 } });
    const original = printoutOf(printer.handed[0] ?? new Uint8Array()).textLines;
    const duplicate = printoutOf(printer.handed[1] ?? new Uint8Array()).textLines;
    const legendAt = duplicate.indexOf("[bold]              COPIA DUPLICADA Nº 1[/bold]");
    expect(duplicate[legendAt - 1]).toContain("Cód. 013");
    expect(duplicate.filter((_line, index) => index !== legendAt)).toEqual(original);
    expect(creditNoteReprints()).toEqual([
      {
        document: "credit_note",
        order_number: 1,
        requested_by: "supervisor",
        authorized_by: null,
        reason_kind: "requested",
        reason_text: REASON,
      },
    ]);
    expect(outboxEvents().at(-1)).toEqual({
      event_type: "reprint_recorded",
      schema_version: 2,
      payload: {
        sale_id: "sale-1",
        document: "credit_note",
        order_number: 1,
        requested_by: "supervisor",
        authorized_by: null,
        reason_kind: "requested",
        reason_text: REASON,
      },
    });
  });

  it("numbers each later duplicate after the previous reprints of the credit note", async () => {
    await printedOnce();
    signedInPerson.set("supervisor");

    for (const orderNumber of [1, 2]) {
      await expect(
        reprintCreditNoteFor(deps(), { saleId: "sale-1", reason: REASON }),
      ).resolves.toEqual({
        kind: "started",
        copy: { kind: "duplicate", order_number: orderNumber },
      });
      await printer.whenWaiting(orderNumber + 1);
      printer.becomeReady();
    }

    expect(creditNoteReprints()).toMatchObject([{ order_number: 1 }, { order_number: 2 }]);
  });

  it("asks another person's authorization from a person without the permission", async () => {
    await printedOnce();

    await expect(
      reprintCreditNoteFor(deps(), { saleId: "sale-1", reason: REASON }),
    ).resolves.toEqual({ kind: "lacks_permission" });
    expect(printer.waiting).toHaveLength(1);
    expect(creditNoteReprints()).toEqual([]);
  });

  it("records who authorized it with the PIN of a person who holds the permission", async () => {
    await printedOnce();

    await expect(
      reprintCreditNoteFor(deps(), {
        saleId: "sale-1",
        reason: REASON,
        authorization: { user_id: "supervisor", pin: AUTHORIZER_PIN },
      }),
    ).resolves.toEqual({ kind: "started", copy: { kind: "duplicate", order_number: 1 } });
    await printer.whenWaiting(2);
    printer.becomeReady();

    expect(creditNoteReprints()).toMatchObject([
      { requested_by: "clerk", authorized_by: "supervisor" },
    ]);
  });

  it("refuses a wrong PIN without printing", async () => {
    await printedOnce();

    const outcome = await reprintCreditNoteFor(deps(), {
      saleId: "sale-1",
      reason: REASON,
      authorization: { user_id: "supervisor", pin: "0000" },
    });

    expect(outcome).toMatchObject({ kind: "wrong_pin" });
    expect(printer.waiting).toHaveLength(1);
    expect(creditNoteReprints()).toEqual([]);
  });

  it("refuses a blank reason", async () => {
    await printedOnce();
    signedInPerson.set("supervisor");

    await expect(reprintCreditNoteFor(deps(), { saleId: "sale-1", reason: "  " })).resolves.toEqual(
      { kind: "invalid_reason", max_length: 200 },
    );
    expect(printer.waiting).toHaveLength(1);
  });

  it("answers not_signed_in when nobody is signed in", async () => {
    signedInPerson.clear();

    await expect(
      reprintCreditNoteFor(deps(), { saleId: "sale-1", reason: REASON }),
    ).resolves.toEqual({ kind: "not_signed_in" });
  });

  it("answers not_found for a sale without an authorized credit note", async () => {
    signedInPerson.set("supervisor");

    await expect(
      reprintCreditNoteFor(deps(), { saleId: "missing", reason: REASON }),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("answers busy while the previous print of the credit note waits for the printer", async () => {
    await printedOnce();
    signedInPerson.set("supervisor");
    await reprintCreditNoteFor(deps(), { saleId: "sale-1", reason: REASON });

    await expect(
      reprintCreditNoteFor(deps(), { saleId: "sale-1", reason: REASON }),
    ).resolves.toEqual({ kind: "busy" });
  });
});

describe("printing the credit note right after the void", () => {
  it("hands the original to the printer on behalf of the person who is signed in", async () => {
    await printVoidedSaleCreditNoteFor(deps(), "sale-1");
    printer.becomeReady();
    await vi.waitFor(() => expect(outboxEvents()).toHaveLength(1));

    expect(printoutOf(printer.handed[0] ?? new Uint8Array()).text).toContain("NOTA DE CRÉDITO C");
    expect(creditNotePrinting()).toMatchObject({ print_attempted_at: "2026-09-30T16:00:00.000Z" });
    expect(outboxEvents()[0]).toMatchObject({
      event_type: "sale_print_state_changed",
      payload: { document: "credit_note" },
    });
    expect(database.prepare("SELECT actor_id FROM outbox").get()).toEqual({ actor_id: "clerk" });
  });

  it("makes the next print from the history a duplicate", async () => {
    await printVoidedSaleCreditNoteFor(deps(), "sale-1");
    printer.becomeReady();
    await vi.waitFor(() => expect(outboxEvents()).toHaveLength(1));

    await expect(printCreditNoteFor(deps(), "sale-1")).resolves.toEqual({
      kind: "already_attempted",
    });
  });

  it("prints nothing when nobody is signed in to be recorded as the one who printed it", async () => {
    signedInPerson.clear();

    await printVoidedSaleCreditNoteFor(deps(), "sale-1");

    expect(printer.waiting).toEqual([]);
    expect(creditNotePrinting()).toBeUndefined();
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

  it("prints nothing while the outbox is not ready", async () => {
    await printVoidedSaleCreditNoteFor(
      deps({ readOutboxChainKey: async () => undefined }),
      "sale-1",
    );

    expect(printer.waiting).toEqual([]);
  });

  it("does nothing when the register has no printer", async () => {
    await expect(
      printVoidedSaleCreditNoteFor(deps({ printers: NO_PRINTERS }), "sale-1"),
    ).resolves.toBeUndefined();
  });
});
