import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditLog, inbox } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN } from "../test-support/backoffice-session.js";
import {
  RESCUE_URL,
  registerWithTicketKey,
  rescueRouteUnderTest,
  rescueSession,
  rescuing,
  TICKET_KEY_VERSION,
} from "./test-support/contingency-backup-ticket-rescue-route.js";
import {
  generatedKey,
  sealedTicketQrCodes,
  ticketContent,
  ticketEvent,
} from "./test-support/sealed-contingency-backup-ticket.js";

const route = rescueRouteUnderTest();

function plainEvent(deviceSeq: number) {
  return ticketEvent(deviceSeq, { occurred_at: "2026-10-01T10:00:00.000Z" });
}

describe("POST /contingency-backup-tickets/rescue access", () => {
  it("answers 401 without a session", async () => {
    const response = await route.app.inject({
      method: "POST",
      url: RESCUE_URL,
      headers: { origin: BACKOFFICE_ORIGIN },
      payload: { qr_codes: ["A"] },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const session = await rescueSession(route.db);

    const response = await route.app.inject({
      method: "POST",
      url: RESCUE_URL,
      headers: { ...session.headers, origin: "https://attacker.example" },
      payload: { qr_codes: ["A"] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it.each(["view_backups_and_rotate_key", "configure_branch"])(
    "answers 403 to a user holding only the %s permission",
    async (permission) => {
      const register = await registerWithTicketKey(route.db);
      const session = await rescueSession(route.db, [permission]);

      const response = await rescuing(route, session, register.seal([plainEvent(1)]));

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
      expect(await route.db.select().from(inbox)).toEqual([]);
    },
  );

  it("answers 400 validation_failed to a request without codes", async () => {
    const session = await rescueSession(route.db);

    const response = await rescuing(route, session, []);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("POST /contingency-backup-tickets/rescue", () => {
  it("delivers the events of the ticket into the inbox and answers what it carried", async () => {
    const register = await registerWithTicketKey(route.db, { registerName: "Caja 3" });
    const session = await rescueSession(route.db);
    const events = [plainEvent(4), plainEvent(5)];

    const response = await rescuing(route, session, register.seal(events));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      outcome: "rescued",
      register_id: register.registerId,
      register_name: "Caja 3",
      received: 2,
      already_received: 0,
      summary: {
        operation: null,
        occurred_at: "2026-10-01T10:00:00.000Z",
        vouchers: [],
        sale_total: null,
      },
    });
    const held = await route.db.select({ eventId: inbox.eventId }).from(inbox);
    expect(held.map((row) => row.eventId).sort()).toEqual(
      events.map((event) => event.event_id).sort(),
    );
  });

  it("names a ticket that carries a completed return as a return", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);
    const returnId = "01a17b16-e642-71b9-8431-f03e95f2e4be";
    const cashier = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
    const returned = ticketEvent(4, {
      aggregate_type: "Return",
      aggregate_id: returnId,
      event_type: "sale_returned",
      occurred_at: "2026-10-06T15:28:00.000Z",
      actor_id: cashier,
      payload: {
        actor_id: cashier,
        authorized_by: null,
        cash_movements: [
          {
            actor_id: cashier,
            amount: 2400,
            id: "01a17b16-e643-71ea-a6b9-563e041d49aa",
            occurred_at: "2026-10-06T15:28:00.000Z",
            ref_id: returnId,
            ref_type: "return",
            type: "REFUND",
          },
        ],
        device_id: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f01",
        id: returnId,
        lines: [
          {
            disposition: "restock",
            product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
            quantity: 1,
            reason: "change_of_mind",
            refunded_amount: 2400,
            sale_line_id: "01a17b16-e63f-7444-be6c-a002bd9f12ff",
          },
        ],
        occurred_at: "2026-10-06T15:28:00.000Z",
        refunds: [
          {
            amount: 2400,
            id: "01a17b16-e643-71ea-a6b9-53e783c80c61",
            kind: "REFUND",
            method: "CASH",
            occurred_at: "2026-10-06T15:28:00.000Z",
            parent_id: "01a17b16-e640-712f-958f-7857c9a8795f",
            provider: "NONE",
            state: "APPROVED",
          },
        ],
        register_id: "a41d9e07-52c3-4b68-8f2e-1c7d3a9b6e02",
        sale_id: "01a17b16-e63f-7444-be6c-9fc6c25fccc8",
        session_id: "01a17b16-e5ed-7208-842c-09eee7eeaad9",
        stock_movements: [
          {
            delta: 1000,
            id: "01a17b16-e643-71ea-a6b9-58ed5936cbf7",
            kind: "return",
            occurred_at: "2026-10-06T15:28:00.000Z",
            product_id: "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06",
            reason: null,
            sale_line_id: "01a17b16-e63f-7444-be6c-a002bd9f12ff",
          },
        ],
        ticket_source: "TYPED",
      },
    });

    const response = await rescuing(route, session, register.seal([returned]));

    expect(response.json()).toMatchObject({
      outcome: "rescued",
      received: 1,
      summary: { operation: "return", occurred_at: "2026-10-06T15:28:00.000Z" },
    });
  });

  it("receives nothing new when the same ticket is scanned again", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);
    const codes = register.seal([plainEvent(4)]);
    await rescuing(route, session, codes);

    const response = await rescuing(route, session, codes);

    expect(response.json()).toMatchObject({ outcome: "rescued", received: 0, already_received: 1 });
    expect(await route.db.select().from(inbox)).toHaveLength(1);
  });

  it("receives the events of an installation that was revoked", async () => {
    const register = await registerWithTicketKey(route.db, {
      revokedAt: new Date("2026-01-04T12:00:00.000Z"),
    });
    const session = await rescueSession(route.db);

    const response = await rescuing(route, session, register.seal([plainEvent(4)]));

    expect(response.json()).toMatchObject({ outcome: "rescued", received: 1 });
  });

  it("answers unreadable to a code that is not a ticket", async () => {
    const session = await rescueSession(route.db);

    const response = await rescuing(route, session, ["not a ticket"]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: "unreadable" });
  });

  it("answers incomplete when a code of the ticket is missing", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);
    const bulky = ticketEvent(1, { payload: { padding: randomBytes(1500).toString("hex") } });
    const codes = register.seal([bulky]);
    expect(codes.length).toBeGreaterThan(1);

    const response = await rescuing(route, session, codes.slice(1));

    expect(response.json()).toEqual({ outcome: "incomplete" });
  });

  it("answers unknown_key when the register holds no key of the ticket's version", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);

    const response = await rescuing(
      route,
      session,
      register.seal([plainEvent(1)], { keyVersion: TICKET_KEY_VERSION + 1 }),
    );

    expect(response.json()).toEqual({ outcome: "unknown_key" });
  });

  it("answers not_authentic for a ticket the register's key did not seal", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);
    const forged = sealedTicketQrCodes({
      frameRegisterId: register.registerId,
      keyVersion: TICKET_KEY_VERSION,
      key: generatedKey(),
      content: ticketContent(register.registerId, register.deviceId, [plainEvent(1)]),
    });

    const response = await rescuing(route, session, forged);

    expect(response.json()).toEqual({ outcome: "not_authentic" });
    expect(await route.db.select().from(inbox)).toEqual([]);
  });

  it("answers foreign_installation when the ticket names an installation of another register", async () => {
    const register = await registerWithTicketKey(route.db);
    const other = await registerWithTicketKey(route.db, { registerName: "Caja 2" });
    const session = await rescueSession(route.db);

    const response = await rescuing(
      route,
      session,
      register.seal([plainEvent(1)], { deviceId: other.deviceId }),
    );

    expect(response.json()).toEqual({ outcome: "foreign_installation" });
    expect(await route.db.select().from(inbox)).toEqual([]);
  });

  it("answers conflicting when an event is already held at another place", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);
    const event = plainEvent(4);
    await rescuing(route, session, register.seal([event]));

    const response = await rescuing(route, session, register.seal([{ ...event, device_seq: 5 }]));

    expect(response.json()).toEqual({ outcome: "conflicting" });
    expect(await route.db.select().from(inbox)).toHaveLength(1);
  });

  it("records who rescued the ticket and what it brought in", async () => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db);

    await rescuing(route, session, register.seal([plainEvent(4), plainEvent(5)]));

    expect(
      await route.db.select().from(auditLog).where(eq(auditLog.entityId, register.registerId)),
    ).toEqual([
      expect.objectContaining({
        entity: "contingency_backup_ticket_rescue",
        actorId: session.userId,
        previousValue: null,
        newValue: { received: 2, already_received: 0 },
      }),
    ]);
  });

  it("records nothing for a ticket it could not open", async () => {
    const session = await rescueSession(route.db);

    await rescuing(route, session, ["not a ticket"]);

    expect(await route.db.select().from(auditLog)).toEqual([]);
  });
});
