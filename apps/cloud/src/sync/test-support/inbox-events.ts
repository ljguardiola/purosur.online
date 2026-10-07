import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { inbox } from "../../platform/db/schema.js";

let nextDeviceSeq = 1;

export type InboxEventValues = Omit<typeof inbox.$inferInsert, "deviceId">;

export async function insertInboxEvent<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deviceId: string,
  overrides: Partial<InboxEventValues> = {},
): Promise<string> {
  const eventId = overrides.eventId ?? randomUUID();
  await db.insert(inbox).values({
    eventId,
    deviceId,
    deviceSeq: nextDeviceSeq++,
    aggregateType: "Sale",
    aggregateId: randomUUID(),
    eventType: "sale_completed",
    schemaVersion: 2,
    payload: {},
    occurredAt: new Date("2026-10-06T11:00:00.000Z"),
    actorId: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
    chainHmac: "hmac",
    receivedAt: new Date("2026-10-06T11:00:05.000Z"),
    ...overrides,
  });
  return eventId;
}
