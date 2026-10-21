import type { PushedEvent } from "../../model/push-batch.js";
import type {
  EventPosition,
  ReplenishedEvent,
  ReplenishmentPosition,
  RestoredRegisterReplenishment,
} from "../restored-register-replenishment-ports.js";

export function anEvent(deviceId: string, deviceSeq: number): ReplenishedEvent {
  const event: PushedEvent = {
    event_id: `event-${deviceId}-${deviceSeq}`,
    device_seq: deviceSeq,
    aggregate_type: "sale",
    aggregate_id: "sale-1",
    event_type: "sale_line_added",
    schema_version: 1,
    payload: { quantity: 2 },
    occurred_at: "2026-10-01T09:00:00.000Z",
    actor_id: "user-1",
    chain_hmac: `hmac-${deviceSeq}`,
  };
  return { deviceId, event };
}

export interface OwnEventsRead {
  registerId: string;
  position: ReplenishmentPosition;
  after: EventPosition | undefined;
  limit: number;
}

export class FakeRestoredRegisterReplenishment implements RestoredRegisterReplenishment {
  events: ReplenishedEvent[] = [];
  eventReads: OwnEventsRead[] = [];

  async ownEventsAbove(
    registerId: string,
    position: ReplenishmentPosition,
    after: EventPosition | undefined,
    limit: number,
  ): Promise<ReplenishedEvent[]> {
    this.eventReads.push({ registerId, position, after, limit });
    const afterIndex =
      after === undefined
        ? -1
        : this.events.findIndex(
            ({ deviceId, event }) =>
              deviceId === after.deviceId && event.device_seq === after.deviceSeq,
          );
    return this.events.slice(afterIndex + 1, afterIndex + 1 + limit);
  }
}
