import type { NewContingencyBackupTicket } from "@purosur/domain/backups/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { appendOutboxEvents, openOutboxDatabase } from "../sync/test-support/sqlite-local-outbox";
import {
  answerContingencyBackupTicketRequest,
  createContingencyBackupTicketRequests,
} from "./contingency-backup-ticket-requests";
import { SqliteContingencyBackupTickets } from "./sqlite-contingency-backup-tickets";

const NOW = new Date("2026-10-10T09:00:00.000Z");

let database: LocalDatabase;
let tickets: SqliteContingencyBackupTickets;
let printerFailure: "paper_out" | null;
let signedIn: "yes" | "no" | "without_permission";

function requests() {
  return createContingencyBackupTicketRequests({
    tickets,
    clock: { now: () => NOW },
    printerFailure: () => printerFailure,
    signedInUserId: () => (signedIn === "no" ? undefined : "u1"),
    gate: {
      run: async (_operation, perform) => {
        if (signedIn === "no") return { kind: "not_signed_in" };
        if (signedIn === "without_permission") return { kind: "lacks_permission" };
        return { kind: "performed", result: await perform({ signedInUserId: "u1" }) };
      },
    },
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
  signedIn = "yes";
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

describe("the requests when nobody is signed in", () => {
  beforeEach(() => {
    signedIn = "no";
  });

  it("refuse to read the tickets", async () => {
    expect(await requests().read()).toEqual({ kind: "not_signed_in" });
  });

  it("refuse to read the ticket of a sale", async () => {
    expect(await requests().ofSale("sale-1")).toEqual({ kind: "not_signed_in" });
  });

  it("refuse to discard, leaving the tickets", async () => {
    await record(ticket("a", 1));
    await print("a");
    await cloudAcknowledgesThrough(1);

    expect(await requests().discard()).toEqual({ kind: "not_signed_in" });

    signedIn = "yes";
    expect(await requests().read()).toMatchObject({ tickets: { discardable: 1 } });
  });

  it("refuse to discard for a person who may not sell", async () => {
    signedIn = "without_permission";

    expect(await requests().discard()).toEqual({ kind: "lacks_permission" });
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
    await cloudAcknowledgesThrough(1);

    expect(await requests().discard()).toEqual({ kind: "not_yet" });
  });
});

describe("answering the renderer's messages", () => {
  const reported: { context: string; error: unknown }[] = [];
  const reportFailure = (context: string, error: unknown) => reported.push({ context, error });

  it("answers each message with the outcome of its request", async () => {
    const withRequests = { contingencyBackupTickets: requests(), reportFailure };

    expect(
      await answerContingencyBackupTicketRequest(withRequests, {
        type: "read-contingency-backup-tickets",
        request_id: "r1",
      }),
    ).toMatchObject({
      type: "read-contingency-backup-tickets-result",
      request_id: "r1",
      outcome: { kind: "read" },
    });
    expect(
      await answerContingencyBackupTicketRequest(withRequests, {
        type: "read-contingency-backup-ticket-of-sale",
        request_id: "r2",
        sale_id: "sale-1",
      }),
    ).toEqual({
      type: "read-contingency-backup-ticket-of-sale-result",
      request_id: "r2",
      outcome: { kind: "read", ticket: { standing: null } },
    });
    expect(
      await answerContingencyBackupTicketRequest(withRequests, {
        type: "discard-contingency-backup-tickets",
        request_id: "r3",
      }),
    ).toEqual({
      type: "discard-contingency-backup-tickets-result",
      request_id: "r3",
      outcome: { kind: "not_yet" },
    });
  });

  it("answers that the tickets are unavailable when the register keeps none", async () => {
    expect(
      await answerContingencyBackupTicketRequest(
        { contingencyBackupTickets: undefined, reportFailure },
        { type: "read-contingency-backup-tickets", request_id: "r1" },
      ),
    ).toEqual({
      type: "read-contingency-backup-tickets-result",
      request_id: "r1",
      outcome: { kind: "unavailable" },
    });
  });

  it("reports a request that fails and answers that the tickets are unavailable", async () => {
    reported.length = 0;
    database.close();

    expect(
      await answerContingencyBackupTicketRequest(
        { contingencyBackupTickets: requests(), reportFailure },
        { type: "discard-contingency-backup-tickets", request_id: "r3" },
      ),
    ).toEqual({
      type: "discard-contingency-backup-tickets-result",
      request_id: "r3",
      outcome: { kind: "unavailable" },
    });
    expect(reported.map(({ context }) => context)).toEqual([
      "discarding the contingency backup tickets",
    ]);
    database = openOutboxDatabase();
  });
});
