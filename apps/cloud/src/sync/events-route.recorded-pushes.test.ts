import { pushEventsResponseSchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { inbox } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";
import { type RecordedPush, recordedPushes } from "./test-support/recorded-pushes.js";

const RECORDED_PUSHES = recordedPushes();

const route = eventsRouteUnderTest();

function storedAsSent(row: typeof inbox.$inferSelect) {
  return {
    event_id: row.eventId,
    device_seq: row.deviceSeq,
    aggregate_type: row.aggregateType,
    aggregate_id: row.aggregateId,
    event_type: row.eventType,
    schema_version: row.schemaVersion,
    payload: row.payload,
    occurred_at: row.occurredAt.toISOString(),
    actor_id: row.actorId,
    chain_hmac: row.chainHmac,
  };
}

describe("POST /events with a push a register in the field sent", () => {
  it.each(RECORDED_PUSHES.map((recorded): [string, RecordedPush] => [recorded.name, recorded]))(
    "accepts and stores every event of %s",
    async (_name, { outboxChainKey, sentBody, push }) => {
      const { deviceId, deviceToken } = await insertEnrolledInstallation(route.db, {
        now: NOW,
        outboxChainKey,
      });

      const response = await route.app.inject({
        method: "POST",
        url: "/events",
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: sentBody,
      });

      expect(response.statusCode).toBe(200);
      expect(pushEventsResponseSchema.parse(response.json())).toEqual({
        status: "ok",
        ack_seq: push.events.at(-1)?.device_seq,
      });
      const stored = await route.db
        .select()
        .from(inbox)
        .where(eq(inbox.deviceId, deviceId))
        .orderBy(asc(inbox.deviceSeq));
      expect(stored.map(storedAsSent)).toEqual(push.events);
    },
  );
});
