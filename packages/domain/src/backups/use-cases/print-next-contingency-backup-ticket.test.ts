import { describe, expect, it } from "vitest";
import type { ContingencyBackupTicketRecord } from "../model/contingency-backup-ticket.js";
import type { ContingencyBackupTicketPrinting } from "./contingency-backup-ticket-ports.js";
import { printNextContingencyBackupTicket } from "./print-next-contingency-backup-ticket.js";
import {
  FakeContingencyBackupTicketPrinter,
  FakeContingencyBackupTicketStore,
} from "./test-support/fake-contingency-backup-tickets.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");

function ticket(overrides: Partial<ContingencyBackupTicketRecord>): ContingencyBackupTicketRecord {
  return {
    id: "ticket-1",
    lastDeviceSeq: 10,
    sealed: true,
    customerDocumentPrinted: null,
    printedAt: null,
    discardedAt: null,
    ...overrides,
  };
}

function setup(
  tickets: ContingencyBackupTicketRecord[],
  acknowledgedThrough = 0,
  printing?: ContingencyBackupTicketPrinting,
  unrenderable: readonly string[] = [],
) {
  const store = new FakeContingencyBackupTicketStore(tickets, acknowledgedThrough);
  const printer = new FakeContingencyBackupTicketPrinter(store, printing, unrenderable);
  return { store, printer, ports: { clock: { now: () => NOW }, printer, store } };
}

describe("printNextContingencyBackupTicket", () => {
  it("prints the oldest ticket that is to print and marks it printed", async () => {
    const { ports, store, printer } = setup([
      ticket({ id: "old", lastDeviceSeq: 3, printedAt: NOW }),
      ticket({ id: "first", lastDeviceSeq: 20 }),
      ticket({ id: "second", lastDeviceSeq: 21 }),
    ]);

    const outcome = await printNextContingencyBackupTicket(ports);

    expect(outcome).toEqual({ kind: "printed", ticketId: "first" });
    expect(printer.printed).toEqual(["first"]);
    expect(store.snapshot().map(({ id, printedAt }) => [id, printedAt])).toEqual([
      ["old", NOW],
      ["first", NOW],
      ["second", null],
    ]);
  });

  it("skips tickets that are not to print", async () => {
    const { ports, printer } = setup(
      [
        ticket({ id: "synced", lastDeviceSeq: 5 }),
        ticket({ id: "no-key", lastDeviceSeq: 20, sealed: false }),
        ticket({ id: "waiting", lastDeviceSeq: 20, customerDocumentPrinted: false }),
        ticket({ id: "discarded", lastDeviceSeq: 20, discardedAt: NOW }),
        ticket({ id: "ready", lastDeviceSeq: 20, customerDocumentPrinted: true }),
      ],
      10,
    );

    const outcome = await printNextContingencyBackupTicket(ports);

    expect(outcome).toEqual({ kind: "printed", ticketId: "ready" });
    expect(printer.printed).toEqual(["ready"]);
  });

  it("has nothing to print when no ticket is to print", async () => {
    const { ports, printer } = setup([ticket({ id: "synced", lastDeviceSeq: 5 })], 10);

    const outcome = await printNextContingencyBackupTicket(ports);

    expect(outcome).toEqual({ kind: "nothing_to_print" });
    expect(printer.printed).toEqual([]);
  });

  it("reports why the printer did not print and marks nothing", async () => {
    const { ports, store } = setup([ticket({ id: "first" })], 0, {
      kind: "not_sent",
      reason: "paper_out",
    });

    const outcome = await printNextContingencyBackupTicket(ports);

    expect(outcome).toEqual({ kind: "not_printed", ticketId: "first", reason: "paper_out" });
    expect(store.snapshot()[0]?.printedAt).toBeNull();
  });

  it("prints the next ticket when an older one cannot be rendered, leaving that one to print", async () => {
    const { ports, store, printer } = setup(
      [ticket({ id: "unrenderable" }), ticket({ id: "next" })],
      0,
      undefined,
      ["unrenderable"],
    );

    const outcome = await printNextContingencyBackupTicket(ports);

    expect(outcome).toEqual({ kind: "printed", ticketId: "next" });
    expect(printer.printed).toEqual(["next"]);
    expect(store.snapshot().map(({ id, printedAt }) => [id, printedAt])).toEqual([
      ["unrenderable", null],
      ["next", NOW],
    ]);
  });

  it("has nothing to print when no ticket to print can be rendered", async () => {
    const { ports, printer } = setup([ticket({ id: "unrenderable" })], 0, undefined, [
      "unrenderable",
    ]);

    const outcome = await printNextContingencyBackupTicket(ports);

    expect(outcome).toEqual({ kind: "nothing_to_print" });
    expect(printer.printed).toEqual([]);
  });

  it("holds no storage transaction while the printer prints", async () => {
    const { ports, printer } = setup([ticket({ id: "first" })]);

    await printNextContingencyBackupTicket(ports);

    expect(printer.transactionOpenWhilePrinting).toBe(false);
  });
});
