import { syncedEventUpcaster } from "@purosur/contracts";
import type { RescuedEventDecoder } from "@purosur/domain/backups/use-cases";

export const syncedRescuedEventDecoder: RescuedEventDecoder = {
  decode(event) {
    const occurredAt = new Date(event.occurred_at);
    const decoded = syncedEventUpcaster.decode({
      eventId: event.event_id,
      deviceId: "",
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
    return decoded.kind === "fact" ? decoded.fact : null;
  },
};
