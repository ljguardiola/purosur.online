import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auditLog, inbox } from "../platform/db/schema.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { SESSION_NOON } from "../test-support/backoffice-session.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { DrizzleContingencyBackupTicketRescues } from "./drizzle-contingency-backup-ticket-rescues.js";
import {
  registerWithTicketKey,
  rescueRouteUnderTest,
} from "./test-support/contingency-backup-ticket-rescue-route.js";
import { ticketEvent } from "./test-support/sealed-contingency-backup-ticket.js";

const route = rescueRouteUnderTest();

function rescues() {
  return new DrizzleContingencyBackupTicketRescues(
    route.db,
    installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
    async () => {},
    () => SESSION_NOON,
  );
}

describe("rescuing a contingency backup ticket in one transaction", () => {
  it("opens the ticket and delivers its events inside the transaction", async () => {
    const register = await registerWithTicketKey(route.db, { registerName: "Caja 3" });
    const event = ticketEvent(1, { occurred_at: "2026-10-01T10:00:00.000Z" });

    const answer = await rescues().transaction(async (tx) => {
      const opening = await tx.open(register.seal([event]));
      if (opening.kind !== "opened") {
        return opening;
      }
      return {
        opening: { registerId: opening.registerId, registerName: opening.registerName },
        delivery: await tx.deliver({
          registerId: opening.registerId,
          deviceId: opening.content.deviceId,
          events: opening.content.events,
        }),
      };
    });

    expect(answer).toEqual({
      opening: { registerId: register.registerId, registerName: "Caja 3" },
      delivery: { kind: "delivered", received: 1, alreadyReceived: 0 },
    });
    expect(await route.db.select({ eventId: inbox.eventId }).from(inbox)).toEqual([
      { eventId: event.event_id },
    ]);
  });

  it("receives nothing when the rescue cannot be recorded", async () => {
    const register = await registerWithTicketKey(route.db);

    await expect(
      rescues().transaction(async (tx) => {
        await tx.deliver({
          registerId: register.registerId,
          deviceId: register.deviceId,
          events: [ticketEvent(1, { occurred_at: "2026-10-01T10:00:00.000Z" })],
        });
        await tx.recordRescue({
          registerId: register.registerId,
          actorId: randomUUID(),
          received: 1,
          alreadyReceived: 0,
          at: SESSION_NOON,
        });
      }),
    ).rejects.toThrow();

    expect(await route.db.select().from(inbox)).toEqual([]);
    expect(await route.db.select().from(auditLog)).toEqual([]);
  });

  it("answers foreign_installation when the events name an installation of another register", async () => {
    const register = await registerWithTicketKey(route.db);
    const other = await registerWithTicketKey(route.db, { registerName: "Caja 2" });

    const answer = await rescues().transaction((tx) =>
      tx.deliver({
        registerId: register.registerId,
        deviceId: other.deviceId,
        events: [ticketEvent(1, { occurred_at: "2026-10-01T10:00:00.000Z" })],
      }),
    );

    expect(answer).toEqual({ kind: "foreign_installation" });
    expect(await route.db.select().from(inbox)).toEqual([]);
  });
});
