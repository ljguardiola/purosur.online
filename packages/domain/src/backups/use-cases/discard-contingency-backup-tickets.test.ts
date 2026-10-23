import { describe, expect, it } from "vitest";
import type { ContingencyBackupTicketRecord } from "../model/contingency-backup-ticket.js";
import { discardContingencyBackupTickets } from "./discard-contingency-backup-tickets.js";
import { FakeContingencyBackupTicketStore } from "./test-support/fake-contingency-backup-tickets.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const EARLIER = new Date("2026-10-14T10:00:00.000Z");

function ticket(overrides: Partial<ContingencyBackupTicketRecord>): ContingencyBackupTicketRecord {
  return {
    id: "ticket-1",
    lastDeviceSeq: 10,
    sealed: true,
    customerDocumentPrinted: null,
    printedAt: EARLIER,
    discardedAt: null,
    ...overrides,
  };
}

function ports(store: FakeContingencyBackupTicketStore) {
  return { clock: { now: () => NOW }, store };
}

describe("discardContingencyBackupTickets", () => {
  it("discards every printed ticket the cloud already has once nothing else is pending", async () => {
    const store = new FakeContingencyBackupTicketStore(
      [
        ticket({ id: "a", lastDeviceSeq: 5 }),
        ticket({ id: "b", lastDeviceSeq: 8 }),
        ticket({ id: "c", lastDeviceSeq: 6, discardedAt: EARLIER }),
        ticket({ id: "d", lastDeviceSeq: 3, printedAt: null }),
      ],
      10,
    );

    const outcome = await discardContingencyBackupTickets(ports(store));

    expect(outcome).toEqual({ kind: "discarded", count: 2 });
    expect(store.snapshot().map(({ id, discardedAt }) => [id, discardedAt])).toEqual([
      ["a", NOW],
      ["b", NOW],
      ["c", EARLIER],
      ["d", null],
    ]);
  });

  it.each([
    ["a printed ticket the cloud does not have yet", ticket({ id: "x", lastDeviceSeq: 20 })],
    ["a ticket still to print", ticket({ id: "x", lastDeviceSeq: 20, printedAt: null })],
    [
      "a ticket awaiting its customer document",
      ticket({ id: "x", lastDeviceSeq: 20, printedAt: null, customerDocumentPrinted: false }),
    ],
    [
      "a ticket missing its key",
      ticket({ id: "x", lastDeviceSeq: 20, printedAt: null, sealed: false }),
    ],
  ])("is not yet while there is %s", async (_name, pending) => {
    const store = new FakeContingencyBackupTicketStore(
      [ticket({ id: "a", lastDeviceSeq: 5 }), pending],
      10,
    );

    const outcome = await discardContingencyBackupTickets(ports(store));

    expect(outcome).toEqual({ kind: "not_yet" });
    expect(store.snapshot().every(({ discardedAt }) => discardedAt === null)).toBe(true);
  });

  it("is not yet when there is nothing to discard", async () => {
    const store = new FakeContingencyBackupTicketStore([], 10);

    expect(await discardContingencyBackupTickets(ports(store))).toEqual({ kind: "not_yet" });
  });

  it("discards nothing when the storage fails", async () => {
    const store = new FakeContingencyBackupTicketStore([ticket({ id: "a", lastDeviceSeq: 5 })], 10);
    store.failNextWrite = true;

    await expect(discardContingencyBackupTickets(ports(store))).rejects.toThrow(
      "storage unavailable",
    );
    expect(store.snapshot()[0]?.discardedAt).toBeNull();
  });
});
