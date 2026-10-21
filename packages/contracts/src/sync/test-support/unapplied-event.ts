import type { PushedEvent } from "@purosur/domain";
import type { UnappliedEvent } from "@purosur/domain/sync/use-cases";

export function unappliedEventOf(
  pushed: PushedEvent,
  overrides: Partial<UnappliedEvent> = {},
): UnappliedEvent {
  return {
    eventId: pushed.event_id,
    deviceId: "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f01",
    deviceSeq: pushed.device_seq,
    aggregateType: pushed.aggregate_type,
    aggregateId: pushed.aggregate_id,
    eventType: pushed.event_type,
    schemaVersion: pushed.schema_version,
    payload: pushed.payload,
    occurredAt: new Date(pushed.occurred_at),
    receivedAt: new Date(pushed.occurred_at),
    actorId: pushed.actor_id,
    quarantinedAt: null,
    nextAttemptAt: null,
    attempts: 0,
    ...overrides,
  };
}
