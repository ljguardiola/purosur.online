import type { PushedEvent } from "../../model/push-batch.js";
import type {
  EventPosition,
  InstallationReceivedSeqs,
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

export function aSaleVoidedEvent(
  deviceId: string,
  deviceSeq: number,
  saleId: string,
): ReplenishedEvent {
  const { event } = anEvent(deviceId, deviceSeq);
  return {
    deviceId,
    event: {
      ...event,
      aggregate_id: saleId,
      event_type: "sale_voided",
      schema_version: 3,
    },
  };
}

export interface OwnEventsRead {
  registerId: string;
  position: ReplenishmentPosition;
  after: EventPosition | undefined;
  limit: number;
  setAsideAbove: ReadonlyMap<string, number>;
}

export class FakeRestoredRegisterReplenishment implements RestoredRegisterReplenishment {
  events: ReplenishedEvent[] = [];
  refusedCopies: EventPosition[] = [];
  eventReads: OwnEventsRead[] = [];

  async receivedSeqsOfRefusedInstallations(): Promise<InstallationReceivedSeqs[]> {
    const refusedInstallations = [...new Set(this.refusedCopies.map(({ deviceId }) => deviceId))];
    return refusedInstallations.map((deviceId) => ({
      deviceId,
      seqs: this.events
        .filter((received) => received.deviceId === deviceId)
        .map(({ event }) => event.device_seq),
    }));
  }

  async ownEventsAbove(
    registerId: string,
    position: ReplenishmentPosition,
    after: EventPosition | undefined,
    limit: number,
    setAsideAbove: ReadonlyMap<string, number>,
  ): Promise<ReplenishedEvent[]> {
    this.eventReads.push({ registerId, position, after, limit, setAsideAbove });
    const served = this.events.filter(
      ({ deviceId, event }) =>
        !this.refusedCopies.some(
          (copy) =>
            copy.deviceId === deviceId &&
            copy.deviceSeq === event.device_seq &&
            event.device_seq > (setAsideAbove.get(deviceId) ?? Number.POSITIVE_INFINITY),
        ),
    );
    const afterIndex =
      after === undefined
        ? -1
        : served.findIndex(
            ({ deviceId, event }) =>
              deviceId === after.deviceId && event.device_seq === after.deviceSeq,
          );
    return served.slice(afterIndex + 1, afterIndex + 1 + limit);
  }
}
