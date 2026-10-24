import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auditLog, inbox } from "../platform/db/schema.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { SESSION_NOON } from "../test-support/backoffice-session.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { InboxRescuedTicketEvents } from "./inbox-rescued-ticket-events.js";
import {
  registerWithTicketKey,
  rescueRouteUnderTest,
} from "./test-support/contingency-backup-ticket-rescue-route.js";
import { ticketEvent } from "./test-support/sealed-contingency-backup-ticket.js";

const route = rescueRouteUnderTest();

function rescuedEvents() {
  return new InboxRescuedTicketEvents(
    route.db,
    installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
    async () => {},
    () => SESSION_NOON,
  );
}

describe("delivering the events of a rescued ticket", () => {
  it("receives nothing when the rescue cannot be recorded", async () => {
    const register = await registerWithTicketKey(route.db);

    await expect(
      rescuedEvents().deliver({
        registerId: register.registerId,
        deviceId: register.deviceId,
        events: [ticketEvent(1, { occurred_at: "2026-10-01T10:00:00.000Z" })],
        rescuedBy: randomUUID(),
      }),
    ).rejects.toThrow();

    expect(await route.db.select().from(inbox)).toEqual([]);
    expect(await route.db.select().from(auditLog)).toEqual([]);
  });

  it("records nothing when the inbox refuses the events", async () => {
    const register = await registerWithTicketKey(route.db);
    const other = await registerWithTicketKey(route.db, { registerName: "Caja 2" });

    const answer = await rescuedEvents().deliver({
      registerId: register.registerId,
      deviceId: other.deviceId,
      events: [ticketEvent(1, { occurred_at: "2026-10-01T10:00:00.000Z" })],
      rescuedBy: randomUUID(),
    });

    expect(answer).toEqual({ kind: "foreign_installation" });
    expect(await route.db.select().from(auditLog)).toEqual([]);
  });
});
