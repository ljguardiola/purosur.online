import { inbox } from "../platform/db/schema.js";

export const unappliedEventColumns = {
  eventId: inbox.eventId,
  deviceId: inbox.deviceId,
  deviceSeq: inbox.deviceSeq,
  aggregateType: inbox.aggregateType,
  aggregateId: inbox.aggregateId,
  eventType: inbox.eventType,
  schemaVersion: inbox.schemaVersion,
  payload: inbox.payload,
  occurredAt: inbox.occurredAt,
  receivedAt: inbox.receivedAt,
  actorId: inbox.actorId,
  attempts: inbox.attempts,
  quarantinedAt: inbox.quarantinedAt,
  nextAttemptAt: inbox.nextAttemptAt,
};
