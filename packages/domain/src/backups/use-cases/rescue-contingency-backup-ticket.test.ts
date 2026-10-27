import { describe, expect, it } from "vitest";
import type { RescuedTicketFact } from "../model/rescued-ticket-summary.js";
import { rescueContingencyBackupTicket } from "./rescue-contingency-backup-ticket.js";
import type {
  ContingencyBackupTicketOpening,
  RescuedTicketDeliveryAnswer,
} from "./rescue-contingency-backup-ticket-ports.js";
import {
  FakeContingencyBackupTicketRescues,
  FakeRescuedEventDecoder,
  rescuedEvent,
} from "./test-support/fake-rescue-contingency-backup-ticket.js";

const QR_CODES = ["QR-1", "QR-2"];
const NOW = new Date("2026-10-14T12:00:00.000Z");

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
  options: { facts?: [string, RescuedTicketFact][]; failRecording?: boolean } = {},
) {
  const rescues = new FakeContingencyBackupTicketRescues({
    opening,
    ...(delivery === undefined ? {} : { delivery }),
    ...(options.failRecording === undefined ? {} : { failRecording: options.failRecording }),
  });
  const decoder = new FakeRescuedEventDecoder(new Map(options.facts ?? []));
  return { rescues, ports: { rescues, decoder, clock: { now: () => NOW } } };
}

describe("rescuing a contingency backup ticket", () => {
  it("opens the scanned codes and delivers the events they carry to their installation", async () => {
    const { ports, rescues } = setup(OPENED, {
      kind: "delivered",
      received: 2,
      alreadyReceived: 0,
    });

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(rescues.opened).toEqual([QR_CODES]);
    expect(rescues.delivered).toEqual([
      { registerId: "register-1", deviceId: "device-1", events: OPENED.content.events },
    ]);
  });

  it("records who rescued the ticket and what it brought in", async () => {
    const { ports, rescues } = setup(OPENED, {
      kind: "delivered",
      received: 1,
      alreadyReceived: 1,
    });

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(rescues.recorded).toEqual([
      { registerId: "register-1", actorId: "user-1", received: 1, alreadyReceived: 1, at: NOW },
    ]);
  });

  it("records a rescue that brought nothing new", async () => {
    const { ports, rescues } = setup(OPENED, {
      kind: "delivered",
      received: 0,
      alreadyReceived: 2,
    });

    await rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" });

    expect(rescues.recorded).toEqual([
      { registerId: "register-1", actorId: "user-1", received: 0, alreadyReceived: 2, at: NOW },
    ]);
  });

  it("delivers nothing when the rescue cannot be recorded", async () => {
    const { ports, rescues } = setup(
      OPENED,
      { kind: "delivered", received: 2, alreadyReceived: 0 },
      { failRecording: true },
    );

    await expect(
      rescueContingencyBackupTicket(ports, { qrCodes: QR_CODES, actorId: "user-1" }),
    ).rejects.toThrow("storage unavailable");

    expect(rescues.delivered).toEqual([]);
    expect(rescues.recorded).toEqual([]);
  });

  it("answers what was received and a summary of the ticket", async () => {
    const { ports } = setup(
      OPENED,
      { kind: "delivered", received: 1, alreadyReceived: 1 },
      {
        facts: [
          ["event-4", { kind: "sale_completed", sale: { total: 2500 } }],
          [
            "event-5",
            {
              kind: "offline_fiscal_document_issued",
              document: { pointOfSale: 3, documentType: "factura_c", number: 88 },
            },
          ],
        ],
      },
    );

    const outcome = await rescueContingencyBackupTicket(ports, {
      qrCodes: QR_CODES,
      actorId: "user-1",
    });

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

    const outcome = await rescueContingencyBackupTicket(ports, {
      qrCodes: QR_CODES,
      actorId: "user-1",
    });

    expect(outcome).toMatchObject({
      kind: "rescued",
      summary: { operation: null, vouchers: [], saleTotal: null },
    });
  });

  it.each(["unreadable", "incomplete", "unknown_key", "not_authentic"] as const)(
    "answers %s and delivers and records nothing when the codes cannot be opened that way",
    async (kind) => {
      const { ports, rescues } = setup({ kind });

      const outcome = await rescueContingencyBackupTicket(ports, {
        qrCodes: QR_CODES,
        actorId: "user-1",
      });

      expect(outcome).toEqual({ kind });
      expect(rescues.delivered).toEqual([]);
      expect(rescues.recorded).toEqual([]);
    },
  );

  it.each(["foreign_installation", "conflicting"] as const)(
    "answers %s and records nothing when the inbox refuses the events that way",
    async (kind) => {
      const { ports, rescues } = setup(OPENED, { kind });

      const outcome = await rescueContingencyBackupTicket(ports, {
        qrCodes: QR_CODES,
        actorId: "user-1",
      });

      expect(outcome).toEqual({ kind });
      expect(rescues.recorded).toEqual([]);
    },
  );
});
