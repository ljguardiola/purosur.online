import type { NewContingencyBackupTicket } from "@purosur/domain/backups/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { appendOutboxEvents, openOutboxDatabase } from "../sync/test-support/sqlite-local-outbox";
import { createContingencyBackupTicketRequests } from "./contingency-backup-ticket-requests";
import { SqliteContingencyBackupTickets } from "./sqlite-contingency-backup-tickets";

const NOW = new Date("2026-10-10T09:00:00.000Z");

let database: LocalDatabase;
let tickets: SqliteContingencyBackupTickets;
let printerFailure: "paper_out" | null;

function requests() {
  return createContingencyBackupTicketRequests({
    tickets,
    clock: { now: () => NOW },
    printerFailure: () => printerFailure,
  });
}

function ticket(
  id: string,
  lastDeviceSeq: number,
  overrides: Partial<NewContingencyBackupTicket> = {},
): NewContingencyBackupTicket {
  return {
    id,
    operation: "cash_movement",
    subjectId: null,
    range: { firstDeviceSeq: lastDeviceSeq, lastDeviceSeq },
    createdAt: new Date(`2026-10-09T12:0${lastDeviceSeq}:00.000Z`),
    sealed: { keyVersion: 1, qrCodes: ["AB"] },
    ...overrides,
  };
}

async function record(...newTickets: NewContingencyBackupTicket[]): Promise<void> {
  for (const newTicket of newTickets) {
    await tickets.transaction((tx) => tx.recordTicket(newTicket));
  }
}

async function print(...ticketIds: string[]): Promise<void> {
  await tickets.transaction(async (tx) => {
    for (const id of ticketIds) await tx.markPrinted(id, NOW);
  });
}

async function cloudAcknowledgesThrough(seq: number): Promise<void> {
  await new SqliteLocalOutbox(database, () => NOW).acknowledgeThrough(seq);
}

beforeEach(() => {
  database = openOutboxDatabase();
  appendOutboxEvents(database, 4);
  tickets = new SqliteContingencyBackupTickets(database);
  printerFailure = null;
});

afterEach(() => {
  database.close();
});

describe("reading the tickets", () => {
  it("counts them by what each waits for, with the printer's failure", async () => {
    await record(
      ticket("synced-and-printed", 1),
      ticket("printed-not-synced", 2),
      ticket("not-printed", 3),
      ticket("no-key", 4, { sealed: null }),
    );
    await print("synced-and-printed", "printed-not-synced");
    await cloudAcknowledgesThrough(1);
    printerFailure = "paper_out";

    expect(await requests().read()).toEqual({
      kind: "read",
      tickets: {
        to_print: 1,
        awaiting_customer_document: 0,
        missing_key: 1,
        kept: 1,
        discardable: 1,
        may_discard: false,
        printer: "paper_out",
      },
    });
  });

  it("allows discarding once only printed and synced tickets are left", async () => {
    await record(ticket("a", 1), ticket("b", 2));
    await print("a", "b");
    await cloudAcknowledgesThrough(2);

    expect(await requests().read()).toMatchObject({
      kind: "read",
      tickets: { discardable: 2, may_discard: true },
    });
  });

  it("counts nothing when there is no ticket", async () => {
    expect(await requests().read()).toEqual({
      kind: "read",
      tickets: {
        to_print: 0,
        awaiting_customer_document: 0,
        missing_key: 0,
        kept: 0,
        discardable: 0,
        may_discard: false,
        printer: null,
      },
    });
  });
});

describe("reading the ticket of a sale", () => {
  it("answers the standing of the latest ticket of the sale", async () => {
    await record(ticket("a", 1, { subjectId: "sale-1" }), ticket("b", 2, { subjectId: "sale-2" }));
    await print("a");

    expect(await requests().ofSale("sale-1")).toEqual({
      kind: "read",
      ticket: { standing: "kept" },
    });
    expect(await requests().ofSale("sale-2")).toEqual({
      kind: "read",
      ticket: { standing: "to_print" },
    });
  });

  it("answers the standing once the ticket was discarded", async () => {
    await record(ticket("a", 1, { subjectId: "sale-1" }));
    await print("a");
    await cloudAcknowledgesThrough(1);
    await requests().discard();

    expect(await requests().ofSale("sale-1")).toEqual({
      kind: "read",
      ticket: { standing: "discarded" },
    });
  });

  it("answers no standing for a sale without a ticket", async () => {
    expect(await requests().ofSale("sale-9")).toEqual({ kind: "read", ticket: { standing: null } });
  });
});

describe("discarding the tickets", () => {
  it("discards the printed and synced ones and says how many", async () => {
    await record(ticket("a", 1), ticket("b", 2));
    await print("a", "b");
    await cloudAcknowledgesThrough(2);

    expect(await requests().discard()).toEqual({ kind: "discarded", count: 2 });
    expect(await requests().read()).toMatchObject({ tickets: { discardable: 0 } });
  });

  it("discards nothing while a ticket still waits", async () => {
    await record(ticket("a", 1), ticket("b", 2));
    await print("a");
    await cloudAcknowledgesThrough(2);

    expect(await requests().discard()).toEqual({ kind: "not_yet" });
  });
});
