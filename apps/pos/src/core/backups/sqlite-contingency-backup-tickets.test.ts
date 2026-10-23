import type { NewContingencyBackupTicket } from "@purosur/domain/backups/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import {
  insertCreditNote,
  insertVoidedSale,
} from "../sales/test-support/credit-note-receipt-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { appendOutboxEvents, openOutboxDatabase } from "../sync/test-support/sqlite-local-outbox";
import { SqliteContingencyBackupTickets } from "./sqlite-contingency-backup-tickets";

let database: LocalDatabase;
let tickets: SqliteContingencyBackupTickets;

function ticket(overrides: Partial<NewContingencyBackupTicket> = {}): NewContingencyBackupTicket {
  return {
    id: "ticket-1",
    operation: "cash_movement",
    subjectId: null,
    range: { firstDeviceSeq: 1, lastDeviceSeq: 2 },
    createdAt: new Date("2026-10-09T12:00:00.000Z"),
    sealed: { keyVersion: 2, qrCodes: ["AB", "CD"] },
    ...overrides,
  };
}

async function record(...newTickets: NewContingencyBackupTicket[]): Promise<void> {
  for (const newTicket of newTickets) {
    await tickets.transaction((tx) => tx.recordTicket(newTicket));
  }
}

function consider() {
  return tickets.transaction((tx) => tx.ticketsToConsider());
}

beforeEach(() => {
  database = openOutboxDatabase();
  tickets = new SqliteContingencyBackupTickets(database);
});

afterEach(() => {
  database.close();
});

describe("the tickets to consider", () => {
  it("are the recorded ones oldest first, with what the rules need to place them", async () => {
    await record(
      ticket({ id: "later", createdAt: new Date("2026-10-09T12:05:00.000Z") }),
      ticket({
        id: "earlier",
        range: { firstDeviceSeq: 3, lastDeviceSeq: 5 },
        createdAt: new Date("2026-10-09T12:01:00.000Z"),
        sealed: null,
      }),
    );

    expect(await consider()).toEqual([
      {
        id: "earlier",
        lastDeviceSeq: 5,
        sealed: false,
        customerDocumentPrinted: null,
        printedAt: null,
        discardedAt: null,
      },
      {
        id: "later",
        lastDeviceSeq: 2,
        sealed: true,
        customerDocumentPrinted: null,
        printedAt: null,
        discardedAt: null,
      },
    ]);
  });

  it("leave out the discarded ones and carry when the others were printed", async () => {
    await record(ticket({ id: "a" }), ticket({ id: "b" }));
    const at = new Date("2026-10-10T08:00:00.000Z");
    await tickets.transaction((tx) => tx.markPrinted("a", at));
    await tickets.transaction((tx) => tx.markDiscarded(["b"], at));

    const considered = await consider();

    expect(considered.map(({ id, printedAt }) => ({ id, printedAt }))).toEqual([
      { id: "a", printedAt: at },
    ]);
  });

  it("break a tie of creation by id", async () => {
    await record(ticket({ id: "b" }), ticket({ id: "a" }));

    expect((await consider()).map(({ id }) => id)).toEqual(["a", "b"]);
  });
});

describe("whether the customer's own document was printed", () => {
  it("is the sale's receipt being sent for a sale", async () => {
    insertVoidedSale(database);
    await record(ticket({ operation: "sale", subjectId: "sale-1" }));

    expect((await consider())[0]?.customerDocumentPrinted).toBe(false);

    database.prepare("UPDATE sales SET printed_at = '2026-10-09T12:00:30.000Z'").run();
    expect((await consider())[0]?.customerDocumentPrinted).toBe(true);
  });

  it("is unknown for a sale the register does not hold", async () => {
    await record(ticket({ operation: "sale", subjectId: "sale-9" }));

    expect((await consider())[0]?.customerDocumentPrinted).toBeNull();
  });

  it("is the credit note being printed for the void of a sale that has one", async () => {
    insertVoidedSale(database);
    insertCreditNote(database);
    await record(ticket({ operation: "sale_void", subjectId: "sale-1" }));

    expect((await consider())[0]?.customerDocumentPrinted).toBe(false);

    database.exec(
      `INSERT INTO credit_note_prints (sale_id, print_attempted_at, printed_at)
       VALUES ('sale-1', '2026-10-09T12:00:30.000Z', '2026-10-09T12:00:31.000Z')`,
    );
    expect((await consider())[0]?.customerDocumentPrinted).toBe(true);
  });

  it("is no document at all for the void of a sale without an authorized credit note", async () => {
    insertVoidedSale(database);
    insertCreditNote(database, {
      state: "REJECTED",
      point_of_sale: null,
      number: null,
      issued_on: null,
      issued_at: null,
      authorization_code: null,
      authorization_code_due_on: null,
    });
    await record(ticket({ operation: "sale_void", subjectId: "sale-1" }));

    expect((await consider())[0]?.customerDocumentPrinted).toBeNull();
  });

  it.each([
    "paid_sale_cancellation",
    "cash_movement",
    "cash_session_opening",
    "cash_session_closing",
    "initial_count",
    "clock_correction",
    "reprint",
  ] as const)("is none for an operation of %s", async (operation) => {
    insertVoidedSale(database);
    await record(ticket({ operation, subjectId: "sale-1" }));

    expect((await consider())[0]?.customerDocumentPrinted).toBeNull();
  });
});

describe("the sequence number the cloud acknowledged", () => {
  it("is zero while it acknowledged nothing", async () => {
    appendOutboxEvents(database, 3);

    expect(await tickets.transaction((tx) => tx.acknowledgedThroughSeq())).toBe(0);
  });

  it("is the last event it acknowledged", async () => {
    appendOutboxEvents(database, 3);
    await new SqliteLocalOutbox(database, () => new Date()).acknowledgeThrough(2);

    expect(await tickets.transaction((tx) => tx.acknowledgedThroughSeq())).toBe(2);
  });

  it("is the last event the register appended once it acknowledged all, even after they are forgotten", async () => {
    appendOutboxEvents(database, 3);
    const outbox = new SqliteLocalOutbox(database, () => new Date("2026-10-01T00:00:00.000Z"));
    await outbox.acknowledgeThrough(3);
    await outbox.forgetAcknowledgedBefore(new Date("2026-10-02T00:00:00.000Z"));

    expect(database.prepare("SELECT count(*) AS held FROM outbox").get()).toEqual({ held: 0 });
    expect(await tickets.transaction((tx) => tx.acknowledgedThroughSeq())).toBe(3);
  });

  it("is zero for a register that appended nothing", async () => {
    expect(await tickets.transaction((tx) => tx.acknowledgedThroughSeq())).toBe(0);
  });
});

describe("a transaction", () => {
  it("keeps nothing of a failed one", async () => {
    await expect(
      tickets.transaction(async (tx) => {
        await tx.recordTicket(ticket());
        throw new Error("the work failed");
      }),
    ).rejects.toThrow("the work failed");

    expect(await consider()).toEqual([]);
  });

  it("refuses a ticket recorded twice", async () => {
    await record(ticket());

    await expect(record(ticket())).rejects.toThrow();
  });
});

describe("the ticket of a subject", () => {
  it("is the latest one recorded for it, discarded or not", async () => {
    await record(
      ticket({ id: "first", subjectId: "sale-1", createdAt: new Date("2026-10-09T12:00:00.000Z") }),
      ticket({
        id: "second",
        subjectId: "sale-1",
        createdAt: new Date("2026-10-09T12:05:00.000Z"),
      }),
      ticket({ id: "other", subjectId: "sale-2", createdAt: new Date("2026-10-09T12:09:00.000Z") }),
    );
    await tickets.transaction((tx) => tx.markDiscarded(["second"], new Date()));

    expect((await tickets.ticketOfSubject("sale-1"))?.id).toBe("second");
    expect((await tickets.ticketOfSubject("sale-1"))?.discardedAt).toBeInstanceOf(Date);
  });

  it("carries the same facts as a ticket to consider", async () => {
    insertVoidedSale(database);
    await record(ticket({ id: "a", operation: "sale", subjectId: "sale-1" }));

    expect(await tickets.ticketOfSubject("sale-1")).toEqual((await consider())[0]);
  });

  it("is none for a subject without a ticket", async () => {
    expect(await tickets.ticketOfSubject("sale-9")).toBeUndefined();
  });
});
