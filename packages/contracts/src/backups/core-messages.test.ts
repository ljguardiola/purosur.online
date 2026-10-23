import { describe, expect, it } from "vitest";
import {
  backupsCoreToRendererMessageSchema,
  backupsRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const TICKETS = {
  to_print: 1,
  awaiting_customer_document: 0,
  missing_key: 0,
  kept: 2,
  discardable: 3,
  may_discard: false,
  discard_permitted: true,
  printer: "paper_out",
};

function acceptsAnswer(type: string, outcome: unknown): boolean {
  return backupsCoreToRendererMessageSchema.safeParse({
    type,
    request_id: REQUEST_ID,
    outcome,
  }).success;
}

describe("backupsRendererToCoreMessageSchema", () => {
  it.each(["read-contingency-backup-tickets", "discard-contingency-backup-tickets"])(
    "accepts %s",
    (type) => {
      expect(backupsRendererToCoreMessageSchema.parse({ type, request_id: REQUEST_ID })).toEqual({
        type,
        request_id: REQUEST_ID,
      });
    },
  );

  it("accepts the read of the ticket of a sale, naming the sale", () => {
    const message = {
      type: "read-contingency-backup-ticket-of-sale",
      request_id: REQUEST_ID,
      sale_id: "sale-1",
    };

    expect(backupsRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects the read of the ticket of a sale without its sale", () => {
    expect(
      backupsRendererToCoreMessageSchema.safeParse({
        type: "read-contingency-backup-ticket-of-sale",
        request_id: REQUEST_ID,
      }).success,
    ).toBe(false);
  });

  it.each(["read-contingency-backup-tickets", "discard-contingency-backup-tickets"])(
    "rejects %s without a request id",
    (type) => {
      expect(backupsRendererToCoreMessageSchema.safeParse({ type }).success).toBe(false);
    },
  );

  it("rejects any other message type", () => {
    expect(backupsRendererToCoreMessageSchema.safeParse({ type: "ping" }).success).toBe(false);
  });
});

describe("backupsCoreToRendererMessageSchema", () => {
  it("accepts the tickets read, with the counts and the printer's failure", () => {
    expect(
      acceptsAnswer("read-contingency-backup-tickets-result", { kind: "read", tickets: TICKETS }),
    ).toBe(true);
  });

  it("rejects the tickets read with counts that do not fit the answer", () => {
    expect(
      acceptsAnswer("read-contingency-backup-tickets-result", {
        kind: "read",
        tickets: { ...TICKETS, kept: -1 },
      }),
    ).toBe(false);
  });

  it("accepts the standing of the ticket of a sale, and none for a sale without one", () => {
    const type = "read-contingency-backup-ticket-of-sale-result";

    expect(acceptsAnswer(type, { kind: "read", ticket: { standing: "to_print" } })).toBe(true);
    expect(acceptsAnswer(type, { kind: "read", ticket: { standing: null } })).toBe(true);
    expect(acceptsAnswer(type, { kind: "read", ticket: { standing: "lost" } })).toBe(false);
  });

  it("accepts the discard of the tickets, discarded or not yet", () => {
    const type = "discard-contingency-backup-tickets-result";

    expect(acceptsAnswer(type, { kind: "discarded", count: 3 })).toBe(true);
    expect(acceptsAnswer(type, { kind: "not_yet" })).toBe(true);
    expect(acceptsAnswer(type, { kind: "discarded", count: -1 })).toBe(false);
  });

  it.each([
    "read-contingency-backup-tickets-result",
    "read-contingency-backup-ticket-of-sale-result",
    "discard-contingency-backup-tickets-result",
  ])("accepts that %s is unavailable or nobody is signed in", (type) => {
    expect(acceptsAnswer(type, { kind: "unavailable" })).toBe(true);
    expect(acceptsAnswer(type, { kind: "not_signed_in" })).toBe(true);
  });

  it("accepts that the person may not discard the tickets, and no other answer to read them", () => {
    expect(
      acceptsAnswer("discard-contingency-backup-tickets-result", { kind: "lacks_permission" }),
    ).toBe(true);
    expect(
      acceptsAnswer("read-contingency-backup-tickets-result", { kind: "lacks_permission" }),
    ).toBe(false);
  });

  it("rejects any other message type", () => {
    expect(acceptsAnswer("ping-result", { kind: "unavailable" })).toBe(false);
  });
});
