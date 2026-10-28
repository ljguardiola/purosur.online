import type { PrintedDocumentKey } from "@purosur/domain";
import { aCompletedSaleFact } from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { insertOpenedSession } from "../register/sqlite-cash-ledger";
import { applyReplenishedReceiptFact } from "./replenished-receipt-facts";
import { applyReplenishedSaleFact } from "./replenished-sale-facts";

type ReceiptFact = Extract<SyncedFact, { kind: "sale_print_state_changed" | "reprint_recorded" }>;

let database: LocalDatabase;

function printState(
  saleId: string,
  attemptedAt: string,
  printedAt: string | null,
  document: PrintedDocumentKey["document"] = "sale_receipt",
  creditNoteId: string | null = "note-1",
): ReceiptFact {
  const times = {
    printAttemptedAt: new Date(attemptedAt),
    printedAt: printedAt === null ? null : new Date(printedAt),
  };
  return {
    kind: "sale_print_state_changed",
    printState:
      document === "credit_note"
        ? { saleId, document, creditNoteId, ...times }
        : { saleId, document, ...times },
  };
}

function reprint(
  orderNumber: number,
  reason: Extract<ReceiptFact, { kind: "reprint_recorded" }>["reprint"]["reason"],
  saleId = "sale-1",
  document: PrintedDocumentKey["document"] = "sale_receipt",
  creditNoteId: string | null = null,
): ReceiptFact {
  const facts = {
    saleId,
    orderNumber,
    requestedBy: "cashier-1",
    authorizedBy: "supervisor-1",
    reason,
    occurredAt: new Date("2026-10-07T10:30:00.000Z"),
  };
  return {
    kind: "reprint_recorded",
    reprint:
      document === "credit_note" ? { document, creditNoteId, ...facts } : { document, ...facts },
  };
}

function printing() {
  return database
    .prepare("SELECT print_attempted_at, printed_at FROM sales WHERE id = 'sale-1'")
    .get();
}

function reprints() {
  return database
    .prepare(
      "SELECT sale_id, document, credit_note_id, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at FROM sale_reprints ORDER BY order_number",
    )
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
  insertOpenedSession(database, {
    id: "session-1",
    registerId: "register-new",
    deviceId: "device-old",
    openedBy: "cashier-1",
    openedAt: new Date("2026-10-07T08:00:00.000Z"),
    openingFloat: 0,
    state: "OPEN",
  });
  applyReplenishedSaleFact(database, aCompletedSaleFact({ operationNumber: 1 }), {
    eventId: "event-1",
    deviceId: "device-old",
  });
});

afterEach(() => {
  database.close();
});

describe("replenishing the printing of a sale into a restored register", () => {
  it("holds when the receipt was sent to the printer and when it was printed", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T10:00:05.000Z", "2026-10-07T10:00:09.000Z"),
    );

    expect(printing()).toEqual({
      print_attempted_at: "2026-10-07T10:00:05.000Z",
      printed_at: "2026-10-07T10:00:09.000Z",
    });
  });

  it("holds an attempt that was not printed without a printed moment", () => {
    applyReplenishedReceiptFact(database, printState("sale-1", "2026-10-07T10:00:05.000Z", null));

    expect(printing()).toEqual({
      print_attempted_at: "2026-10-07T10:00:05.000Z",
      printed_at: null,
    });
  });

  it("keeps the later attempt the snapshot already holds over an earlier one", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T10:09:00.000Z", "2026-10-07T10:09:03.000Z"),
    );

    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T10:00:05.000Z", "2026-10-07T10:00:09.000Z"),
    );

    expect(printing()).toEqual({
      print_attempted_at: "2026-10-07T10:09:00.000Z",
      printed_at: "2026-10-07T10:09:03.000Z",
    });
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(database, printState("sale-9", "2026-10-07T10:00:05.000Z", null)),
    ).toThrow("sale sale-9 is not held");
  });
});

describe("replenishing the reprints of a sale into a restored register", () => {
  it("holds a reprint with who asked for it, who authorized it and why", () => {
    applyReplenishedReceiptFact(database, reprint(1, { kind: "requested", text: "Se mojo" }));
    applyReplenishedReceiptFact(database, reprint(2, { kind: "retry" }));

    expect(reprints()).toEqual([
      {
        sale_id: "sale-1",
        document: "sale_receipt",
        credit_note_id: null,
        order_number: 1,
        requested_by: "cashier-1",
        authorized_by: "supervisor-1",
        reason_kind: "requested",
        reason_text: "Se mojo",
        occurred_at: "2026-10-07T10:30:00.000Z",
      },
      {
        sale_id: "sale-1",
        document: "sale_receipt",
        credit_note_id: null,
        order_number: 2,
        requested_by: "cashier-1",
        authorized_by: "supervisor-1",
        reason_kind: "retry",
        reason_text: null,
        occurred_at: "2026-10-07T10:30:00.000Z",
      },
    ]);
  });

  it("changes nothing when the snapshot already holds the reprint", () => {
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }));
    const before = reprints();

    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }));

    expect(reprints()).toEqual(before);
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }, "sale-9")),
    ).toThrow("sale sale-9 is not held");
  });
});

describe("replenishing the credit note of a sale into a restored register", () => {
  function creditNotePrinting() {
    return database
      .prepare(
        "SELECT print_attempted_at, printed_at FROM credit_note_prints WHERE credit_note_id = 'note-1'",
      )
      .get();
  }

  beforeEach(() => {
    database.exec(
      `INSERT INTO sale_credit_notes (
         id, sale_id, total, receiver_tax_status_code, corrected_voucher_type,
         corrected_point_of_sale, corrected_number, state, recorded_at, answered_at
       ) VALUES (
         'note-1', 'sale-1', 3000, 5, 11, 3, 41, 'REJECTED', '2026-10-07T11:00:00.000Z',
         '2026-10-07T11:00:01.000Z'
       )`,
    );
  });

  it("holds when the credit note was sent to the printer and printed, apart from the receipt's", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T11:00:05.000Z", "2026-10-07T11:00:09.000Z", "credit_note"),
    );

    expect(creditNotePrinting()).toEqual({
      print_attempted_at: "2026-10-07T11:00:05.000Z",
      printed_at: "2026-10-07T11:00:09.000Z",
    });
    expect(printing()).toEqual({ print_attempted_at: null, printed_at: null });
  });

  it("keeps the later attempt the snapshot already holds over an earlier one", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T11:09:00.000Z", "2026-10-07T11:09:03.000Z", "credit_note"),
    );

    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T11:00:05.000Z", "2026-10-07T11:00:09.000Z", "credit_note"),
    );

    expect(creditNotePrinting()).toEqual({
      print_attempted_at: "2026-10-07T11:09:00.000Z",
      printed_at: "2026-10-07T11:09:03.000Z",
    });
  });

  it("holds an attempt that was not printed without a printed moment", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T11:00:05.000Z", null, "credit_note"),
    );

    expect(creditNotePrinting()).toEqual({
      print_attempted_at: "2026-10-07T11:00:05.000Z",
      printed_at: null,
    });
  });

  it("holds a reprint of the credit note beside a reprint of the receipt with the same order number", () => {
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }));
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }, "sale-1", "credit_note"));
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }, "sale-1", "credit_note"));

    expect(database.prepare("SELECT document FROM sale_reprints ORDER BY document").all()).toEqual([
      { document: "credit_note" },
      { document: "sale_receipt" },
    ]);
  });

  it("holds a reprint of a legacy event that names no credit note against the sale's credit note", () => {
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }, "sale-1", "credit_note"));
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }, "sale-1", "credit_note"));

    expect(reprints()).toMatchObject([{ document: "credit_note", credit_note_id: "note-1" }]);
  });

  it("holds a reprint against the credit note the event names", () => {
    applyReplenishedReceiptFact(
      database,
      reprint(1, { kind: "retry" }, "sale-1", "credit_note", "note-1"),
    );

    expect(reprints()).toMatchObject([{ document: "credit_note", credit_note_id: "note-1" }]);
  });

  it("refuses a reprint of a credit note the sale does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(
        database,
        reprint(1, { kind: "retry" }, "sale-1", "credit_note", "note-9"),
      ),
    ).toThrow("credit note note-9 is not held by sale sale-1");
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(
        database,
        printState("sale-9", "2026-10-07T11:00:05.000Z", null, "credit_note"),
      ),
    ).toThrow("sale sale-9 is not held");
  });

  it("is refused for a credit note the sale does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(
        database,
        printState("sale-1", "2026-10-07T11:00:05.000Z", null, "credit_note", "note-9"),
      ),
    ).toThrow("credit note note-9 is not held by sale sale-1");
  });

  it("holds the print of an event that names no credit note on the sale's credit note", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T11:00:05.000Z", null, "credit_note", null),
    );

    expect(creditNotePrinting()).toEqual({
      print_attempted_at: "2026-10-07T11:00:05.000Z",
      printed_at: null,
    });
  });

  describe("when the sale holds the credit notes of its returns too", () => {
    beforeEach(() => {
      database.exec(
        `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
         VALUES ('return-1', 'sale-1', 'register-new', 'device-new', 'session-1', 'cashier-1', 'QR', '2026-10-08T10:00:00.000Z');
         INSERT INTO sale_credit_notes (
           id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code,
           corrected_voucher_type, corrected_point_of_sale, corrected_number, state, recorded_at,
           answered_at
         ) VALUES (
           'note-r1', 'sale-1', 'return-1', '2026-10-08', 1000, 5, 11, 3, 41, 'REJECTED',
           '2026-10-08T10:00:00.000Z', '2026-10-08T10:00:01.000Z'
         )`,
      );
    });

    it("holds the print on the credit note the event names, leaving the others untouched", () => {
      applyReplenishedReceiptFact(
        database,
        printState("sale-1", "2026-10-08T11:00:05.000Z", null, "credit_note", "note-r1"),
      );

      expect(database.prepare("SELECT credit_note_id FROM credit_note_prints").all()).toEqual([
        { credit_note_id: "note-r1" },
      ]);
    });

    it("holds the print of an event that names no credit note on the credit note of the void, not a return's", () => {
      applyReplenishedReceiptFact(
        database,
        printState("sale-1", "2026-10-08T11:00:05.000Z", null, "credit_note", null),
      );

      expect(database.prepare("SELECT credit_note_id FROM credit_note_prints").all()).toEqual([
        { credit_note_id: "note-1" },
      ]);
    });

    it("holds a reprint against the credit note of a return the event names, beside the void's with the same order number", () => {
      applyReplenishedReceiptFact(
        database,
        reprint(1, { kind: "retry" }, "sale-1", "credit_note", "note-r1"),
      );
      applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }, "sale-1", "credit_note"));
      applyReplenishedReceiptFact(
        database,
        reprint(1, { kind: "retry" }, "sale-1", "credit_note", "note-r1"),
      );

      expect(
        database
          .prepare("SELECT credit_note_id, order_number FROM sale_reprints ORDER BY credit_note_id")
          .all(),
      ).toEqual([
        { credit_note_id: "note-1", order_number: 1 },
        { credit_note_id: "note-r1", order_number: 1 },
      ]);
    });

    it("is refused for an event that names no credit note when the sale holds only a return's", () => {
      database.exec("DELETE FROM sale_credit_notes WHERE id = 'note-1'");

      expect(() =>
        applyReplenishedReceiptFact(
          database,
          printState("sale-1", "2026-10-08T11:00:05.000Z", null, "credit_note", null),
        ),
      ).toThrow("sale sale-1 holds no credit note of its void and the event names none");
      expect(() =>
        applyReplenishedReceiptFact(
          database,
          reprint(1, { kind: "retry" }, "sale-1", "credit_note"),
        ),
      ).toThrow("sale sale-1 holds no credit note of its void and the event names none");
    });
  });

  it("is refused for an event that names no credit note when the sale holds none", () => {
    database.exec("DELETE FROM sale_credit_notes");

    expect(() =>
      applyReplenishedReceiptFact(
        database,
        printState("sale-1", "2026-10-07T11:00:05.000Z", null, "credit_note", null),
      ),
    ).toThrow("sale sale-1 holds no credit note of its void and the event names none");
  });
});

describe("replenishing the invoice of a deferred sale into a restored register", () => {
  function invoicePrinting() {
    return database
      .prepare(
        "SELECT print_attempted_at, printed_at FROM deferred_invoice_prints WHERE sale_id = 'sale-1'",
      )
      .get();
  }

  it("holds when the invoice was sent to the printer and printed, apart from the sale receipt's", () => {
    applyReplenishedReceiptFact(
      database,
      printState(
        "sale-1",
        "2026-10-08T11:00:05.000Z",
        "2026-10-08T11:00:09.000Z",
        "deferred_invoice",
      ),
    );

    expect(invoicePrinting()).toEqual({
      print_attempted_at: "2026-10-08T11:00:05.000Z",
      printed_at: "2026-10-08T11:00:09.000Z",
    });
    expect(printing()).toEqual({ print_attempted_at: null, printed_at: null });
  });

  it("keeps the later attempt the snapshot already holds over an earlier one", () => {
    applyReplenishedReceiptFact(
      database,
      printState(
        "sale-1",
        "2026-10-08T11:09:00.000Z",
        "2026-10-08T11:09:03.000Z",
        "deferred_invoice",
      ),
    );

    applyReplenishedReceiptFact(
      database,
      printState(
        "sale-1",
        "2026-10-08T11:00:05.000Z",
        "2026-10-08T11:00:09.000Z",
        "deferred_invoice",
      ),
    );

    expect(invoicePrinting()).toEqual({
      print_attempted_at: "2026-10-08T11:09:00.000Z",
      printed_at: "2026-10-08T11:09:03.000Z",
    });
  });

  it("holds an attempt that was not printed without a printed moment", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-08T11:00:05.000Z", null, "deferred_invoice"),
    );

    expect(invoicePrinting()).toEqual({
      print_attempted_at: "2026-10-08T11:00:05.000Z",
      printed_at: null,
    });
  });

  it("leaves the sale receipt's print state as it was when the invoice's fact comes after it", () => {
    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-07T11:00:05.000Z", "2026-10-07T11:00:09.000Z"),
    );

    applyReplenishedReceiptFact(
      database,
      printState("sale-1", "2026-10-08T11:00:05.000Z", null, "deferred_invoice"),
    );

    expect(printing()).toEqual({
      print_attempted_at: "2026-10-07T11:00:05.000Z",
      printed_at: "2026-10-07T11:00:09.000Z",
    });
  });

  it("holds a reprint of the invoice beside a reprint of the receipt with the same order number", () => {
    applyReplenishedReceiptFact(database, reprint(1, { kind: "retry" }));
    applyReplenishedReceiptFact(
      database,
      reprint(1, { kind: "retry" }, "sale-1", "deferred_invoice"),
    );
    applyReplenishedReceiptFact(
      database,
      reprint(1, { kind: "retry" }, "sale-1", "deferred_invoice"),
    );

    expect(database.prepare("SELECT document FROM sale_reprints ORDER BY document").all()).toEqual([
      { document: "deferred_invoice" },
      { document: "sale_receipt" },
    ]);
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() =>
      applyReplenishedReceiptFact(
        database,
        printState("sale-9", "2026-10-08T11:00:05.000Z", null, "deferred_invoice"),
      ),
    ).toThrow("sale sale-9 is not held");
  });
});
