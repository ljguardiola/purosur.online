import { syncedEventUpcaster } from "@purosur/contracts";
import type { RegisterReplenishmentDecoder } from "@purosur/domain/sync/use-cases";

export const replenishedEventDecoder: RegisterReplenishmentDecoder = {
  decode({ deviceId, event }) {
    const occurredAt = new Date(event.occurred_at);
    return syncedEventUpcaster.decode({
      eventId: event.event_id,
      deviceId,
      deviceSeq: event.device_seq,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      eventType: event.event_type,
      schemaVersion: event.schema_version,
      payload: event.payload,
      occurredAt,
      receivedAt: occurredAt,
      actorId: event.actor_id,
      quarantinedAt: null,
      nextAttemptAt: null,
      attempts: 0,
    });
  },
};
