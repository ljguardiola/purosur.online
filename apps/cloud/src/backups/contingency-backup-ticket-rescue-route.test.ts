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

  it.each([
    "view_backups_and_rotate_key",
    "configure_branch",
  ])("answers 403 to a user holding only the %s permission", async (permission) => {
    const register = await registerWithTicketKey(route.db);
    const session = await rescueSession(route.db, [permission]);

    const response = await rescuing(route, session, register.seal([plainEvent(1)]));

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await route.db.select().from(inbox)).toEqual([]);
  });

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
