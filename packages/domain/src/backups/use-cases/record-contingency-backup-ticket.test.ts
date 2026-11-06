import { describe, expect, it } from "vitest";
import { recordContingencyBackupTicket } from "./record-contingency-backup-ticket.js";
import {
  FakeContingencyBackupTicketIds,
  FakeContingencyBackupTicketSealer,
  FakeContingencyBackupTicketStore,
} from "./test-support/fake-contingency-backup-tickets.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const UNREACHABLE = { lastHealthCheckOkAt: null, at: NOW };
const REACHABLE = { lastHealthCheckOkAt: new Date(NOW.getTime() - 1_000), at: NOW };
const RANGE = { firstDeviceSeq: 4, lastDeviceSeq: 6 };

function setup(sealer = new FakeContingencyBackupTicketSealer()) {
  const store = new FakeContingencyBackupTicketStore();
  return {
    store,
    sealer,
    ports: { ids: new FakeContingencyBackupTicketIds(), clock: { now: () => NOW }, sealer, store },
  };
}

describe("recordContingencyBackupTicket", () => {
  it("seals the events of an operation while the cloud was unreachable and records the ticket with its QR codes", async () => {
    const { ports, store, sealer } = setup();

    const outcome = await recordContingencyBackupTicket(ports, {
      operation: "sale",
      subjectId: "sale-1",
      cloudLinkAround: [REACHABLE, UNREACHABLE],
      range: RANGE,
    });

    expect(outcome).toEqual({ kind: "recorded", ticketId: "ticket-1" });
    expect(sealer.sealed).toEqual(["ticket-1"]);
    expect(store.recorded()).toEqual([
      {
        id: "ticket-1",
        operation: "sale",
        subjectId: "sale-1",
        range: RANGE,
        createdAt: NOW,
        sealed: { keyVersion: 1, qrCodes: ["QR-1", "QR-2"] },
      },
    ]);
  });

  it("records the ticket without codes when the register has no key", async () => {
    const { ports, store } = setup(new FakeContingencyBackupTicketSealer({ kind: "no_key" }));

    const outcome = await recordContingencyBackupTicket(ports, {
      operation: "cash_movement",
      subjectId: null,
      cloudLinkAround: [UNREACHABLE],
      range: RANGE,
    });

    expect(outcome).toEqual({ kind: "recorded_without_key", ticketId: "ticket-1" });
    expect(store.recorded()).toEqual([
      {
        id: "ticket-1",
        operation: "cash_movement",
        subjectId: null,
        range: RANGE,
        createdAt: NOW,
        sealed: null,
      },
    ]);
  });

  it("seals and records nothing when every reading reached the cloud", async () => {
    const { ports, store, sealer } = setup();

    const outcome = await recordContingencyBackupTicket(ports, {
      operation: "sale",
      subjectId: "sale-1",
      cloudLinkAround: [REACHABLE],
      range: RANGE,
    });

    expect(outcome).toEqual({ kind: "cloud_reached" });
    expect(sealer.sealed).toEqual([]);
    expect(store.recorded()).toEqual([]);
  });

  it("seals and records nothing when the operation appended no events", async () => {
    const { ports, store, sealer } = setup();

    const outcome = await recordContingencyBackupTicket(ports, {
      operation: "reprint",
      subjectId: "sale-1",
      cloudLinkAround: [UNREACHABLE],
      range: { firstDeviceSeq: 7, lastDeviceSeq: 6 },
    });

    expect(outcome).toEqual({ kind: "no_events" });
    expect(sealer.sealed).toEqual([]);
    expect(store.recorded()).toEqual([]);
  });

  it("treats no readings as the cloud reached", async () => {
    const { ports, store } = setup();

    const outcome = await recordContingencyBackupTicket(ports, {
      operation: "sale",
      subjectId: null,
      cloudLinkAround: [],
      range: RANGE,
    });

    expect(outcome).toEqual({ kind: "cloud_reached" });
    expect(store.recorded()).toEqual([]);
  });

  it("reports the cloud reached before reporting no events", async () => {
    const { ports } = setup();

    const outcome = await recordContingencyBackupTicket(ports, {
      operation: "reprint",
      subjectId: null,
      cloudLinkAround: [REACHABLE],
      range: { firstDeviceSeq: 7, lastDeviceSeq: 6 },
    });

    expect(outcome).toEqual({ kind: "cloud_reached" });
  });
});
