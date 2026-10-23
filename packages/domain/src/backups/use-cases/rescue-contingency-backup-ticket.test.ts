import { describe, expect, it } from "vitest";
import type { RescuedTicketFact } from "../model/rescued-ticket-summary.js";
import type {
  ContingencyBackupTicketOpening,
  RescuedTicketDeliveryAnswer,
} from "./rescue-contingency-backup-ticket-ports.js";
import { rescueContingencyBackupTicket } from "./rescue-contingency-backup-ticket.js";
import {
  FakeContingencyBackupTicketOpener,
  FakeRescuedEventDecoder,
  FakeRescuedTicketAudit,
  FakeRescuedTicketEvents,
  rescuedEvent,
} from "./test-support/fake-rescue-contingency-backup-ticket.js";

const QR_CODES = ["QR-1", "QR-2"];

const OPENED: ContingencyBackupTicketOpening = {
  kind: "opened",
  registerId: "register-1",
  registerName: "Caja 1",
  content: {
    deviceId: "device-1",
    events: [
      rescuedEvent(4, "2026-10-01T10:05:00.000Z"),
      rescuedEvent(5, "2026-10-01T10:00:00.000Z"),
    ],
  },
};

function setup(
  opening: ContingencyBackupTicketOpening,
  delivery?: RescuedTicketDeliveryAnswer,
  facts: [string, RescuedTicketFact][] = [],
) {
  const opener = new FakeContingencyBackupTicketOpener(opening);
  const events = new FakeRescuedTicketEvents(delivery);
  const decoder = new FakeRescuedEventDecoder(new Map(facts));
  const audit = new FakeRescuedTicketAudit();
  return { opener, events, decoder, audit, ports: { opener, events, decoder, audit } };
}

describe("rescuing a contingency backup ticket", () => {
  it("opens the scanned codes and delivers the events they carry to their installation", async () => {
    const { ports, opener, events } = setup(OPENED, {
      kind: "delivered",
      received: 2,
      alreadyReceived: 0,
    });

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(opener.opened).toEqual([QR_CODES]);
    expect(events.delivered).toEqual([
      { registerId: "register-1", deviceId: "device-1", events: OPENED.content.events },
    ]);
  });

  it("answers what was received and a summary of the ticket", async () => {
    const { ports } = setup(OPENED, { kind: "delivered", received: 1, alreadyReceived: 1 }, [
      ["event-4", { kind: "sale_completed", sale: { total: 2500 } }],
      [
        "event-5",
        {
          kind: "offline_fiscal_document_issued",
          document: { pointOfSale: 3, documentType: "factura_c", number: 88 },
        },
      ],
    ]);

    const outcome = await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(outcome).toEqual({
      kind: "rescued",
      registerId: "register-1",
      registerName: "Caja 1",
      received: 1,
      alreadyReceived: 1,
      summary: {
        operation: "sale",
        occurredAt: "2026-10-01T10:00:00.000Z",
        vouchers: [{ pointOfSale: 3, documentType: "factura_c", number: 88 }],
        saleTotal: 2500,
      },
    });
  });

  it("summarizes a ticket whose events it cannot read without them", async () => {
    const { ports } = setup(OPENED, { kind: "delivered", received: 2, alreadyReceived: 0 });

    const outcome = await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(outcome).toMatchObject({
      kind: "rescued",
      summary: { operation: null, vouchers: [], saleTotal: null },
    });
  });

  it.each([
    "unreadable",
    "incomplete",
    "unknown_key",
    "not_authentic",
  ] as const)("answers %s and delivers nothing when the codes cannot be opened that way", async (kind) => {
    const { ports, events } = setup({ kind });

    const outcome = await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(outcome).toEqual({ kind });
    expect(events.delivered).toEqual([]);
  });

  it.each([
    "foreign_installation",
    "conflicting",
  ] as const)("answers %s when the inbox refuses the events that way", async (kind) => {
    const { ports } = setup(OPENED, { kind });

    const outcome = await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(outcome).toEqual({ kind });
  });

  it("records who rescued the ticket and what it brought in", async () => {
    const { ports, audit } = setup(OPENED, { kind: "delivered", received: 1, alreadyReceived: 1 });

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(audit.entries).toEqual([
      { registerId: "register-1", actorId: "user-1", received: 1, alreadyReceived: 1 },
    ]);
  });

  it("records a rescue that brought nothing new", async () => {
    const { ports, audit } = setup(OPENED, { kind: "delivered", received: 0, alreadyReceived: 2 });

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(audit.entries).toHaveLength(1);
  });

  it.each([
    { kind: "unreadable" },
    { kind: "incomplete" },
    { kind: "unknown_key" },
    { kind: "not_authentic" },
  ] as const)("records nothing when the codes answer $kind", async (opening) => {
    const { ports, audit } = setup(opening);

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(audit.entries).toEqual([]);
  });

  it.each([
    "foreign_installation",
    "conflicting",
  ] as const)("records nothing when the inbox answers %s", async (kind) => {
    const { ports, audit } = setup(OPENED, { kind });

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(audit.entries).toEqual([]);
  });
});
